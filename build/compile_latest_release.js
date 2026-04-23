import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const is_main = path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);

/**
 * Parse CLI flags for latest-release compilation.
 * @param {string[]} argv
 * @returns {{dry_run:boolean}}
 */
function parse_cli_options(argv) {
  return {
    dry_run: argv.includes('--dry-run'),
  };
}

/**
 * Read JSON from disk.
 * @param {string} file_path
 * @returns {Record<string, any>}
 */
function read_json_file(file_path) {
  return JSON.parse(fs.readFileSync(file_path, 'utf8'));
}

/**
 * Normalize line endings.
 * @param {string} md
 * @returns {string}
 */
function normalize_newlines(md) {
  return (md ?? '').replace(/\r\n/g, '\n');
}

/**
 * Trim surrounding whitespace while preserving internal formatting.
 * @param {string} md
 * @returns {string}
 */
function trim_markdown(md) {
  return normalize_newlines(md).trim();
}

/**
 * Read a file when present.
 * @param {string} file_path
 * @returns {string}
 */
function read_optional_file(file_path) {
  return fs.existsSync(file_path)
    ? normalize_newlines(fs.readFileSync(file_path, 'utf8'))
    : '';
}

/**
 * Write markdown with normalized trailing newline.
 * @param {string} file_path
 * @param {string} md
 */
function write_markdown_file(file_path, md) {
  fs.mkdirSync(path.dirname(file_path), { recursive: true });
  fs.writeFileSync(file_path, `${trim_markdown(md)}\n`);
}

/**
 * Return X.x from X.x.p.
 * @param {string} version
 * @returns {string}
 */
function get_minor_version(version) {
  const [major = '0', minor = '0'] = `${version}`.split('.');
  return `${major}.${minor}`;
}

/**
 * Return X-x from X.x.p for SC.app pathing.
 * @param {string} version
 * @returns {string}
 */
function get_minor_slug(version) {
  const [major = '0', minor = '0'] = `${version}`.split('.');
  return `${major}-${minor}`;
}

/**
 * Return patch version number from X.x.p.
 * @param {string} version
 * @returns {number}
 */
function get_patch_version(version) {
  const [, , patch = '0'] = `${version}`.split('.');
  const parsed_patch = Number.parseInt(patch, 10);
  return Number.isNaN(parsed_patch) ? 0 : parsed_patch;
}

/**
 * Extract the top section before release notes / patch notes.
 * @param {string} md
 * @returns {string}
 */
function extract_top_section(md) {
  const lines = normalize_newlines(md).split('\n');
  // start index is line after "%% begin content %%" if present, otherwise 0
  const content_marker = '%% begin content %%';
  const content_marker_index = lines.findIndex((line) => line.trim() === content_marker);
  const start_index = content_marker_index === -1 ? 0 : content_marker_index + 1;
  const stop_index = lines.findIndex((line) => {
    const trimmed = line.trim();
    return (
      /^##\s+Release notes\s*$/i.test(trimmed)
      || /^##\s+patch\s+`v[^`]+`\s*$/i.test(trimmed)
      || /^##\s+next patch\s*$/i.test(trimmed)
    );
  });

  return trim_markdown(lines.slice(start_index, stop_index === -1 ? lines.length : stop_index).join('\n'));
}

/**
 * Parse version sections from markdown.
 * @param {string} md
 * @param {RegExp[]} heading_patterns
 * @returns {{version:string, body:string}[]}
 */
function parse_version_sections(md, heading_patterns) {
  const lines = normalize_newlines(md).split('\n');
  const sections = [];
  let current = null;

  lines.forEach((line) => {
    let version = null;
    heading_patterns.some((pattern) => {
      const match = line.match(pattern);
      if (!match) return false;
      version = match[1];
      return true;
    });

    if (version) {
      if (current) {
        sections.push({
          version: current.version,
          body: trim_markdown(current.body_lines.join('\n')),
        });
      }
      current = { version, body_lines: [] };
      return;
    }

    if (current) {
      current.body_lines.push(line);
    }
  });

  if (current) {
    sections.push({
      version: current.version,
      body: trim_markdown(current.body_lines.join('\n')),
    });
  }

  return sections;
}

/**
 * Parse canonical patch sections from the synced release page.
 * @param {string} md
 * @returns {{version:string, body:string}[]}
 */
function parse_canonical_patch_sections(md) {
  return parse_version_sections(md, [
    /^###\s+`v([^`]+)`\s*$/,
  ]);
}

/**
 * Parse the canonical release page structure.
 * @param {string} md
 * @returns {{
 *   top_section:string,
 *   release_notes_prefix:string,
 *   release_notes_content:string,
 *   release_notes_suffix:string,
 *   has_release_notes_heading:boolean,
 * }}
 */
function parse_canonical_release_page(md) {
  const normalized = normalize_newlines(md);
  const heading_match = normalized.match(/^##\s+Release notes\s*$/im);

  if (!heading_match || heading_match.index == null) {
    return {
      top_section: trim_markdown(normalized),
      release_notes_prefix: '',
      release_notes_content: '',
      release_notes_suffix: '',
      has_release_notes_heading: false,
    };
  }

  // detect "%% begin content %%" and get next line as start
  const content_marker = '%% begin content %%';
  const top_section_start = md.indexOf(content_marker) + content_marker.length;
  const release_notes_heading_start = heading_match.index;
  const heading_end = release_notes_heading_start + heading_match[0].length;
  const top_section = trim_markdown(normalized.slice(top_section_start, release_notes_heading_start));
  const after_heading = normalize_newlines(normalized.slice(heading_end));

  const begin_marker_match = after_heading.match(/^%% begin content %%\s*$/m);
  const end_marker_match = after_heading.match(/^%% end content %%\s*$/m);

  if (
    begin_marker_match
    && end_marker_match
    && begin_marker_match.index != null
    && end_marker_match.index != null
    && end_marker_match.index >= begin_marker_match.index
  ) {
    const prefix = trim_markdown(after_heading.slice(0, begin_marker_match.index));
    const content_start = begin_marker_match.index + begin_marker_match[0].length;
    const content = trim_markdown(after_heading.slice(content_start, end_marker_match.index));
    const suffix_start = end_marker_match.index + end_marker_match[0].length;
    const suffix = trim_markdown(after_heading.slice(suffix_start));

    return {
      top_section,
      release_notes_prefix: prefix,
      release_notes_content: content,
      release_notes_suffix: suffix,
      has_release_notes_heading: true,
    };
  }

  return {
    top_section,
    release_notes_prefix: '',
    release_notes_content: trim_markdown(after_heading),
    release_notes_suffix: '',
    has_release_notes_heading: true,
  };
}

/**
 * Insert or replace the current patch section while preserving order for older patches.
 * @param {{version:string, body:string}[]} release_sections
 * @param {{version:string, body:string}} current_patch
 * @returns {{release_sections:{version:string, body:string}[], current_patch_md:string}}
 */
function upsert_current_patch_section(release_sections, current_patch) {
  const current_body = trim_markdown(current_patch.body);
  const existing_section = release_sections.find((section) => section.version === current_patch.version);

  if (!current_body) {
    return {
      release_sections,
      current_patch_md: existing_section?.body ?? '',
    };
  }

  return {
    release_sections: [
      { version: current_patch.version, body: current_body },
      ...release_sections.filter((section) => section.version !== current_patch.version),
    ],
    current_patch_md: current_body,
  };
}

/**
 * Build the "What's new" callout.
 * @param {{version:string, current_patch_md:string}} params
 * @returns {string}
 */
function build_whats_new_callout(params) {
  const { version, current_patch_md } = params;
  const lines = [`> [!NOTE] What's new in \`v${version}\``];

  trim_markdown(current_patch_md).split('\n').forEach((line) => {
    lines.push(line ? `> ${line}` : '>');
  });

  return lines.join('\n').trim();
}

/**
 * Build the "Additional notes" section for minor releases.
 * @param {string} current_patch_md
 * @returns {string}
 */
function build_additional_notes_section(current_patch_md) {
  const body = trim_markdown(current_patch_md);
  return ['## Additional notes', body].filter(Boolean).join('\n\n').trim();
}

/**
 * Insert the callout below the first H1.
 * @param {string} md
 * @param {string} callout_md
 * @returns {string}
 */
function insert_callout_below_h1(md, callout_md) {
  const lines = normalize_newlines(md).split('\n');
  const h1_index = lines.findIndex((line) => /^#\s+/.test(line.trim()));

  if (h1_index === -1) {
    return [trim_markdown(callout_md), trim_markdown(md)].filter(Boolean).join('\n\n').trim();
  }

  const before = trim_markdown(lines.slice(0, h1_index + 1).join('\n'));
  const after = trim_markdown(lines.slice(h1_index + 1).join('\n'));

  return [before, trim_markdown(callout_md), after].filter(Boolean).join('\n\n').trim();
}

/**
 * Build latest_release.md from the canonical page and current patch notes.
 * @param {{version:string, plugin_prefix:string, canonical_release_md:string, current_patch_md:string}} params
 * @returns {string}
 */
function build_latest_release_md(params) {
  const {
    version,
    plugin_prefix,
    canonical_release_md,
    current_patch_md,
  } = params;
  const top_section = extract_top_section(canonical_release_md);
  const details_link = `[More details about the latest releases](https://smartconnections.app/smart-${plugin_prefix.toLowerCase()}/releases/${get_minor_slug(version)}/)`;

  if (get_patch_version(version) === 0) {
    const additional_notes_md = build_additional_notes_section(current_patch_md);
    return `${[top_section, additional_notes_md, details_link].filter(Boolean).join('\n\n').trim()}\n`;
  }

  const callout_md = build_whats_new_callout({ version, current_patch_md });
  const linked_top_section = insert_callout_below_h1(top_section, callout_md);

  return `${[linked_top_section, details_link].filter(Boolean).join('\n\n').trim()}\n`;
}

/**
 * Compile latest_release.md from canonical sources and sync the canonical note.
 * @param {{
 *   version:string,
 *   plugin_prefix?:string,
 *   releases_dir?:string,
 *   output_path?:string,
 *   canonical_release_dir?:string,
 *   next_patch_path?:string,
 *   dry_run?:boolean,
 * }} params
 * @returns {{
 *   latest_release_md:string,
 *   canonical_release_md:string,
 *   current_patch_md:string,
 *   release_body:string,
 *   canonical_release_path:string,
 *   output_path:string,
 *   next_patch_path:string,
 *   dry_run:boolean,
 * }}
 */
function compile_latest_release(params) {
  const {
    version,
    plugin_prefix = process.env.PLUGIN_PREFIX,
    releases_dir = path.join(process.cwd(), 'releases'),
    output_path = path.join(releases_dir, 'latest_release.md'),
    canonical_release_dir = path.resolve(process.cwd(), '../obsidian-1/+Outcome/release'),
    next_patch_path = path.join(releases_dir, 'next_patch.md'),
    dry_run = false,
  } = params;

  if (!plugin_prefix) {
    throw new Error('PLUGIN_PREFIX is required to compile latest_release.md');
  }

  const minor_version = get_minor_version(version);
  const canonical_release_path = path.join(canonical_release_dir, `${plugin_prefix} - ${minor_version}.md`);
  const next_patch_md = read_optional_file(next_patch_path);
  const canonical_release_source = read_optional_file(canonical_release_path);
  if(!canonical_release_source) {
    throw new Error(`Canonical release page not found at ${canonical_release_path}.`);
  }
  const parsed_canonical = parse_canonical_release_page(canonical_release_source);
  const release_sections = parse_canonical_patch_sections(parsed_canonical.release_notes_content);
  const upsert_result = upsert_current_patch_section(release_sections, {
    version,
    body: next_patch_md,
  });
  const current_patch_md = upsert_result.current_patch_md;
  console.log(upsert_result);

  if (!current_patch_md) {
    throw new Error(`No patch notes found for v${version}. Add notes to releases/next_patch.md or sync the canonical release page first.`);
  }

  const latest_release_md = build_latest_release_md({
    version,
    plugin_prefix,
    canonical_release_md: canonical_release_source,
    current_patch_md,
  });
  write_markdown_file(output_path, latest_release_md);

  const release_notes_line_i = canonical_release_source.split('\n').findIndex((line) => /^##\s+Release notes\s*$/i.test(line.trim()));
  //insert ### version\nnext_patch_md below the release notes heading or at the end if not found
  const updated_canonical_md = [
    ...canonical_release_source.split('\n').slice(0, release_notes_line_i + 1),
    '',
    '###' + ` \`v${version}\``,
    current_patch_md,
    '',
    ...canonical_release_source.split('\n').slice(release_notes_line_i + 1),
  ].join('\n');
  console.log('Compiled latest_release.md:\n', updated_canonical_md);


  if (!dry_run) {
    write_markdown_file(canonical_release_path, updated_canonical_md);
    fs.writeFileSync(next_patch_path, '');
  }

  return {
    latest_release_md,
    canonical_release_md: updated_canonical_md,
    current_patch_md,
    release_body: latest_release_md,
    canonical_release_path,
    output_path,
    next_patch_path,
    dry_run,
  };
}

/**
 * Execute from the command line.
 */
function run_from_cli() {
  const cli_options = parse_cli_options(process.argv.slice(2));
  const package_json = read_json_file(path.join(process.cwd(), 'package.json'));
  const result = compile_latest_release({
    version: package_json.version,
    dry_run: cli_options.dry_run,
  });

  console.log(`latest_release.md ${cli_options.dry_run ? 'previewed' : 'compiled'} for ${package_json.version}`);
  console.log(`- latest_release.md: ${result.output_path}`);
  console.log(`- canonical release page: ${result.canonical_release_path}`);
  console.log(`- next_patch.md: ${result.next_patch_path}${cli_options.dry_run ? ' (preserved)' : ' (truncated)'}`);
}

if (is_main) {
  try {
    run_from_cli();
  } catch (error) {
    console.error('Error compiling latest_release.md:', error);
    process.exit(1);
  }
}

export {
  compile_latest_release,
  parse_cli_options,
};
