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
 * Capitalize a single word without changing the rest of the word.
 * @param {string} word
 * @returns {string}
 */
function capitalize_word(word) {
  return word ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : '';
}

/**
 * Convert a plugin id or name segment into a display phrase.
 * @param {string} value
 * @returns {string}
 */
function title_case_phrase(value) {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(capitalize_word)
    .join(' ');
}

/**
 * Convert a display phrase into a URL slug.
 * @param {string} value
 * @returns {string}
 */
function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Infer the release-page note prefix from plugin metadata.
 * @param {{plugin_prefix?:string, plugin_name?:string, plugin_id?:string}} params
 * @returns {string}
 */
function resolve_plugin_prefix(params = {}) {
  const explicit_prefix = params.plugin_prefix || process.env.PLUGIN_PREFIX;
  if (explicit_prefix) return explicit_prefix;

  const cleaned_name = String(params.plugin_name || '')
    .replace(/^Obsidian\s+/i, '')
    .replace(/^Smart\s+/i, '')
    .replace(/\s+(Core|Pro|Early)$/i, '')
    .replace(/\s+API$/i, '')
    .trim();

  if (cleaned_name) {
    return title_case_phrase(cleaned_name);
  }

  const cleaned_id = String(params.plugin_id || '')
    .replace(/-obsidian$/i, '')
    .replace(/^obsidian-/i, '')
    .replace(/^smart-/i, '')
    .replace(/-(core|pro|early)$/i, '')
    .replace(/-api$/i, '')
    .trim();

  return title_case_phrase(cleaned_id || 'plugin');
}

/**
 * Infer the SC.app plugin path slug.
 * @param {{plugin_slug?:string, plugin_prefix?:string, plugin_name?:string, plugin_id?:string}} params
 * @returns {string}
 */
function resolve_plugin_slug(params = {}) {
  const explicit_slug = params.plugin_slug || process.env.PLUGIN_SLUG;
  if (explicit_slug) return explicit_slug.replace(/^\/+|\/+$/g, '');

  const plugin_prefix = params.plugin_prefix || resolve_plugin_prefix(params);
  return `smart-${slugify(plugin_prefix)}`;
}

/**
 * Resolve release metadata used by the compiler and per-repo runner script.
 * @param {{plugin_prefix?:string, plugin_slug?:string, plugin_name?:string, plugin_id?:string}} params
 * @returns {{plugin_prefix:string, plugin_slug:string}}
 */
function resolve_release_config(params = {}) {
  const plugin_prefix = resolve_plugin_prefix(params);
  const plugin_slug = resolve_plugin_slug({ ...params, plugin_prefix });
  return { plugin_prefix, plugin_slug };
}

/**
 * Return the conventional minor-release markdown file path for a repo.
 * @param {string} releases_dir
 * @param {string} version
 * @returns {string}
 */
function get_minor_release_file_path(releases_dir, version) {
  const [major = '0', minor = '0'] = `${version}`.split('.');
  return path.join(releases_dir, `${major}.${minor}.0.md`);
}

/**
 * Extract the top section before release notes / patch notes.
 * @param {string} md
 * @returns {string}
 */
function extract_top_section(md) {
  const lines = normalize_newlines(md).split('\n');
  const content_marker = '%% begin content %%';
  const content_marker_index = lines.findIndex((line) => line.trim() === content_marker);
  const start_index = content_marker_index === -1 ? 0 : content_marker_index + 1;
  const stop_index = lines.findIndex((line, index) => {
    if (index < start_index) return false;
    const trimmed = line.trim();
    return (
      /^##\s+Release notes\s*$/i.test(trimmed)
      || /^##\s+patch\s+`v[^`]+`\s*$/i.test(trimmed)
      || /^##\s+next patch\s*$/i.test(trimmed)
      || trimmed === '%% end content %%'
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
 * Parse legacy repo patch sections from an older release note file.
 * @param {string} md
 * @returns {{version:string, body:string}[]}
 */
function parse_repo_patch_sections(md) {
  return parse_version_sections(md, [
    /^##\s+patch\s+`v([^`]+)`\s*$/i,
    /^###\s+`v([^`]+)`\s*$/,
  ]);
}

/**
 * Extract the body under a legacy "## next patch" section.
 * @param {string} md
 * @returns {string}
 */
function extract_next_patch_section(md) {
  const lines = normalize_newlines(md).split('\n');
  const heading_index = lines.findIndex((line) => /^##\s+next patch\s*$/i.test(line.trim()));
  if (heading_index === -1) return '';

  const body_lines = [];
  for (let i = heading_index + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i].trim())) break;
    body_lines.push(lines[i]);
  }

  return trim_markdown(body_lines.join('\n'));
}

/**
 * Locate the release notes heading and content range in a canonical page.
 * @param {string} md
 * @returns {{before_heading:string, heading:string, content:string, after_content:string, has_heading:boolean}}
 */
function get_release_notes_region(md) {
  const normalized = normalize_newlines(md);
  const heading_match = normalized.match(/^##\s+Release notes\s*$/im);

  if (!heading_match || heading_match.index == null) {
    return {
      before_heading: normalized,
      heading: '## Release notes',
      content: '',
      after_content: '',
      has_heading: false,
    };
  }

  const heading_start = heading_match.index;
  const heading_end = heading_start + heading_match[0].length;
  const after_heading = normalized.slice(heading_end);
  const end_marker_match = after_heading.match(/^%% end content %%\s*$/m);
  const content_end = end_marker_match && end_marker_match.index != null
    ? end_marker_match.index
    : after_heading.length;

  return {
    before_heading: normalized.slice(0, heading_start),
    heading: heading_match[0],
    content: after_heading.slice(0, content_end),
    after_content: after_heading.slice(content_end),
    has_heading: true,
  };
}

/**
 * Remove a canonical patch section, if it already exists.
 * @param {string} md
 * @param {string} version
 * @returns {string}
 */
function remove_canonical_patch_section(md, version) {
  const lines = normalize_newlines(md).split('\n');
  const out = [];
  let skipping = false;

  lines.forEach((line) => {
    const is_patch_heading = /^###\s+`v([^`]+)`\s*$/.exec(line.trim());

    if (is_patch_heading?.[1] === version) {
      skipping = true;
      return;
    }

    if (skipping && is_patch_heading) {
      skipping = false;
    }

    if (!skipping) {
      out.push(line);
    }
  });

  return trim_markdown(out.join('\n'));
}

/**
 * Build canonical patch section markdown.
 * @param {{version:string, body:string}} section
 * @returns {string}
 */
function build_canonical_patch_section(section) {
  return [`### \`v${section.version}\``, trim_markdown(section.body)].filter(Boolean).join('\n').trim();
}

/**
 * Render canonical patch sections.
 * @param {{version:string, body:string}[]} sections
 * @returns {string}
 */
function render_canonical_patch_sections(sections) {
  return sections
    .filter((section) => trim_markdown(section.body))
    .map(build_canonical_patch_section)
    .join('\n\n')
    .trim();
}

/**
 * Insert or replace the current patch section while preserving existing content order.
 * @param {string} canonical_release_md
 * @param {{version:string, body:string}} current_patch
 * @returns {string}
 */
function upsert_canonical_patch_section(canonical_release_md, current_patch) {
  const region = get_release_notes_region(canonical_release_md);
  const section_md = build_canonical_patch_section(current_patch);

  if (!region.has_heading) {
    const end_marker = '%% end content %%';
    const marker_index = canonical_release_md.indexOf(end_marker);
    const before_marker = marker_index === -1 ? canonical_release_md : canonical_release_md.slice(0, marker_index);
    const after_marker = marker_index === -1 ? '' : canonical_release_md.slice(marker_index);
    return [
      trim_markdown(before_marker),
      '## Release notes',
      section_md,
      trim_markdown(after_marker),
    ].filter(Boolean).join('\n\n');
  }

  const remaining_content = remove_canonical_patch_section(region.content, current_patch.version);
  const release_notes_content = [section_md, remaining_content].filter(Boolean).join('\n\n');

  return `${region.before_heading}${region.heading}\n\n${release_notes_content}\n\n${region.after_content}`;
}

/**
 * Find a canonical patch section by version.
 * @param {string} canonical_release_md
 * @param {string} version
 * @returns {string}
 */
function find_canonical_patch_body(canonical_release_md, version) {
  const region = get_release_notes_region(canonical_release_md);
  const section = parse_canonical_patch_sections(region.content)
    .find((patch_section) => patch_section.version === version);
  return section?.body || '';
}

/**
 * Build a canonical release page when it does not exist yet.
 * @param {{version:string, plugin_prefix:string, plugin_slug:string, source_md?:string}} params
 * @returns {string}
 */
function build_canonical_release_page(params) {
  const {
    version,
    plugin_prefix,
    plugin_slug,
    source_md = '',
  } = params;
  const minor_version = get_minor_version(version);
  const top_section = extract_top_section(source_md) || `# Smart ${plugin_prefix} \`v${minor_version}\``;
  const release_sections_md = render_canonical_patch_sections(parse_repo_patch_sections(source_md));

  return `---
SC.app: "${plugin_slug}/releases/${get_minor_slug(version)}"
layout: obsidian-markdown
alignment:
  - "[[${plugin_prefix} OP]]"
---
## WDLL
## context

## waiting for

## next actions


# page content
%% begin content %%
${trim_markdown(top_section)}

## Release notes
${release_sections_md ? `\n${release_sections_md}\n` : ''}

%% end content %%

# inbox`;
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
  return body ? ['## Additional notes', body].join('\n\n').trim() : '';
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
 * @param {{version:string, plugin_slug:string, canonical_release_md:string, current_patch_md:string}} params
 * @returns {string}
 */
function build_latest_release_md(params) {
  const {
    version,
    plugin_slug,
    canonical_release_md,
    current_patch_md,
  } = params;
  const top_section = extract_top_section(canonical_release_md);
  const details_link = `[More details about the latest releases](https://smartconnections.app/${plugin_slug}/releases/${get_minor_slug(version)}/)`;

  if (get_patch_version(version) === 0) {
    const additional_notes_md = build_additional_notes_section(current_patch_md);
    return `${[top_section, additional_notes_md, details_link].filter(Boolean).join('\n\n').trim()}\n`;
  }

  const callout_md = build_whats_new_callout({ version, current_patch_md });
  const linked_top_section = insert_callout_below_h1(top_section, callout_md);

  return `${[linked_top_section, details_link].filter(Boolean).join('\n\n').trim()}\n`;
}

/**
 * Resolve current patch markdown from next_patch.md, canonical, or legacy release file.
 * @param {{version:string, next_patch_md:string, canonical_release_md:string, fallback_release_md:string}} params
 * @returns {{current_patch_md:string, source:string}}
 */
function resolve_current_patch_md(params) {
  const {
    version,
    next_patch_md,
    canonical_release_md,
    fallback_release_md,
  } = params;
  const trimmed_next_patch = trim_markdown(next_patch_md);
  if (trimmed_next_patch) {
    return { current_patch_md: trimmed_next_patch, source: 'next_patch' };
  }

  const canonical_patch_md = trim_markdown(find_canonical_patch_body(canonical_release_md, version));
  if (canonical_patch_md) {
    return { current_patch_md: canonical_patch_md, source: 'canonical' };
  }

  const legacy_patch_md = parse_repo_patch_sections(fallback_release_md)
    .find((section) => section.version === version)?.body || '';
  if (trim_markdown(legacy_patch_md)) {
    return { current_patch_md: trim_markdown(legacy_patch_md), source: 'legacy_patch' };
  }

  const legacy_next_patch_md = extract_next_patch_section(fallback_release_md);
  if (trim_markdown(legacy_next_patch_md)) {
    return { current_patch_md: trim_markdown(legacy_next_patch_md), source: 'legacy_next_patch' };
  }

  return { current_patch_md: '', source: 'none' };
}

/**
 * Compile latest_release.md from canonical sources and sync the canonical note.
 * @param {{
 *   version:string,
 *   plugin_prefix?:string,
 *   plugin_slug?:string,
 *   plugin_name?:string,
 *   plugin_id?:string,
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
 *   plugin_prefix:string,
 *   plugin_slug:string,
 *   dry_run:boolean,
 * }}
 */
function compile_latest_release(params) {
  const {
    version,
    releases_dir = path.join(process.cwd(), 'releases'),
    output_path = path.join(releases_dir, 'latest_release.md'),
    canonical_release_dir = path.resolve(process.cwd(), '../obsidian-1/+Outcome/release'),
    next_patch_path = path.join(releases_dir, 'next_patch.md'),
    dry_run = false,
  } = params;
  const { plugin_prefix, plugin_slug } = resolve_release_config(params);

  if (!version) {
    throw new Error('version is required to compile latest_release.md');
  }

  const minor_version = get_minor_version(version);
  const canonical_release_path = path.join(canonical_release_dir, `${plugin_prefix} - ${minor_version}.md`);
  const fallback_release_path = get_minor_release_file_path(releases_dir, version);
  const fallback_release_md = read_optional_file(fallback_release_path);
  const next_patch_md = read_optional_file(next_patch_path);
  const canonical_release_source = read_optional_file(canonical_release_path)
    || build_canonical_release_page({
      version,
      plugin_prefix,
      plugin_slug,
      source_md: fallback_release_md,
    });

  const current_patch_result = resolve_current_patch_md({
    version,
    next_patch_md,
    canonical_release_md: canonical_release_source,
    fallback_release_md,
  });
  const current_patch_md = current_patch_result.current_patch_md;

  if (get_patch_version(version) > 0 && !current_patch_md) {
    throw new Error(`No patch notes found for v${version}. Add notes to releases/next_patch.md or sync the canonical release page first.`);
  }

  const should_sync_canonical = Boolean(current_patch_md) && current_patch_result.source !== 'canonical';
  const canonical_release_md = should_sync_canonical
    ? upsert_canonical_patch_section(canonical_release_source, { version, body: current_patch_md })
    : canonical_release_source;
  const latest_release_md = build_latest_release_md({
    version,
    plugin_slug,
    canonical_release_md,
    current_patch_md,
  });

  if (!dry_run) {
    write_markdown_file(output_path, latest_release_md);
    write_markdown_file(canonical_release_path, canonical_release_md);

    if (trim_markdown(next_patch_md)) {
      fs.writeFileSync(next_patch_path, '');
    }
  }

  return {
    latest_release_md,
    canonical_release_md,
    current_patch_md,
    release_body: latest_release_md,
    canonical_release_path,
    output_path,
    next_patch_path,
    plugin_prefix,
    plugin_slug,
    dry_run,
  };
}

/**
 * Execute from the command line.
 */
function run_from_cli() {
  const cli_options = parse_cli_options(process.argv.slice(2));
  const package_json = read_json_file(path.join(process.cwd(), 'package.json'));
  const manifest_json = read_json_file(path.join(process.cwd(), 'manifest.json'));
  const result = compile_latest_release({
    version: package_json.version,
    plugin_name: manifest_json.name,
    plugin_id: manifest_json.id,
    dry_run: cli_options.dry_run,
  });

  console.log(`latest_release.md ${cli_options.dry_run ? 'previewed' : 'compiled'} for ${package_json.version}`);
  console.log(`- plugin: ${result.plugin_prefix} (${result.plugin_slug})`);
  console.log(`- latest_release.md: ${result.output_path}`);
  console.log(`- canonical release page: ${result.canonical_release_path}`);
  console.log(`- next_patch.md: ${result.next_patch_path}${cli_options.dry_run ? ' (preserved)' : ' (truncated when used)'}`);
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
  build_additional_notes_section,
  build_latest_release_md,
  build_whats_new_callout,
  compile_latest_release,
  extract_next_patch_section,
  extract_top_section,
  get_minor_slug,
  get_minor_version,
  get_patch_version,
  parse_cli_options,
  parse_canonical_patch_sections,
  parse_repo_patch_sections,
  resolve_release_config,
  resolve_plugin_prefix,
  resolve_plugin_slug,
  upsert_canonical_patch_section,
};
