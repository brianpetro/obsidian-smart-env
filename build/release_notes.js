import fs from 'fs';
import path from 'path';

/**
 * Compare two semver strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function semver_compare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = pa[i] - pb[i];
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Returns absolute path to the most-recent release notes file
 * found in the provided directory or `null` when none exist.
 * @param {string} dir
 * @param {string} current_version
 * @returns {string|null}
 */
function latest_release_file(dir, current_version) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((file_name) => /^\d+\.\d+\.\d+\.md$/.test(file_name) && file_name !== `${current_version}.md`);
  if (files.length === 0) return null;
  files.sort((a, b) => semver_compare(b.replace('.md', ''), a.replace('.md', '')));
  return path.join(dir, files[0]);
}

/**
 * Merges an optional user description with previous release notes
 * under a new heading for the given version.
 * @param {string} current_version
 * @param {string} prior_notes
 * @param {string} user_desc
 * @returns {string}
 */
function build_combined_notes(current_version, prior_notes, user_desc) {
  const heading = `\n\n## patch \`v${current_version}\`\n\n`;
  const desc_block = user_desc?.trim() ? `${user_desc.trim()}\n` : '';
  return `${prior_notes ?? ''}${heading}${desc_block}`.trim();
}

/**
 * @typedef {Object} CliOptions
 * @property {boolean} draft
 * @property {boolean} replace_existing
 */

/**
 * Parses CLI flags.
 * @param {string[]} argv
 * @returns {CliOptions}
 */
function parse_cli_options(argv) {
  return {
    draft: argv.includes('--draft'),
    replace_existing: argv.includes('--replace-existing'),
  };
}

/**
 * Parse patch sections from release notes.
 * @param {string} md
 * @returns {{version:string, body:string}[]}
 */
function parse_patches(md) {
  const lines = md.split(/\r?\n/);
  const patches = [];
  let current = null;
  lines.forEach((line) => {
    const match = line.match(/^## patch `v([^`]+)`$/);
    if (match) {
      if (current) patches.push(current);
      current = { version: match[1], body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  });
  if (current) patches.push(current);
  return patches.map((patch) => ({ ...patch, body: patch.body.trim() }));
}

/**
 * Format release notes into plugin release notes.
 * @param {string} md
 * @param {string} current_version
 * @returns {string}
 */
function format_release_notes_content(md, current_version) {
  const replaced = md.replace('## next patch', `## patch \`v${current_version}\``);
  const patches = parse_patches(replaced);
  const first_index = replaced.search(/^## patch `v/m);
  const main = first_index === -1 ? replaced.trim() : replaced.slice(0, first_index).trim();
  patches.sort((a, b) => semver_compare(b.version, a.version));
  const latest = patches[0];
  const previous = patches.slice(1);
  const lines = [];
  if (latest) {
    lines.push(`> [!NOTE] Patch v${latest.version}`);
    if (latest.body) {
      latest.body.split('\n').forEach((line) => lines.push(`> ${line}`));
    }
    lines.push('');
  }
  if (previous.length) {
    lines.push('> [!NOTE]- Previous patches');
    previous.forEach((patch) => {
      lines.push(`> > [!NOTE]- v${patch.version}`);
      if (patch.body) {
        patch.body.split('\n').forEach((line) => lines.push(`> > ${line}`));
      }
      lines.push('> ');
    });
    lines.push('> ');
  }
  if (main) lines.push(main);
  return `${lines.join('\n').trim()}\n`;
}

/**
 * Write plugin release notes to file.
 * @param {{release_path:string, output_path:string, version:string}} opts
 */
function write_plugin_release_notes(opts) {
  const { release_path, output_path, version } = opts;
  const md = fs.readFileSync(release_path, 'utf8');
  const formatted = format_release_notes_content(md, version);
  fs.writeFileSync(output_path, formatted);
}

export {
  semver_compare,
  latest_release_file,
  build_combined_notes,
  parse_cli_options,
  parse_patches,
  format_release_notes_content,
  write_plugin_release_notes,
};
