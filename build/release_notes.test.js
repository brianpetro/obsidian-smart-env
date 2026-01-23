import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'ava';
import {
  build_combined_notes,
  format_release_notes_content,
  latest_release_file,
  parse_cli_options,
  parse_patches,
  semver_compare,
  write_plugin_release_notes,
} from './release_notes.js';

test('semver_compare orders versions descending', (t) => {
  t.true(semver_compare('1.2.0', '1.1.9') > 0);
  t.true(semver_compare('1.2.0', '1.2.0') === 0);
  t.true(semver_compare('0.9.0', '1.0.0') < 0);
});

test('latest_release_file returns newest file excluding current version', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-'));
  fs.writeFileSync(path.join(dir, '1.0.0.md'), 'old');
  fs.writeFileSync(path.join(dir, '1.5.0.md'), 'current');
  fs.writeFileSync(path.join(dir, '2.0.0.md'), 'newest');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore me');

  const result = latest_release_file(dir, '1.5.0');

  t.is(result, path.join(dir, '2.0.0.md'));
});

test('build_combined_notes merges prior notes and user description', (t) => {
  const combined = build_combined_notes('1.2.3', '## next patch\n- existing', 'New features');

  t.true(combined.includes('## patch `v1.2.3`'));
  t.true(combined.includes('existing'));
  t.true(combined.includes('New features'));
});

test('parse_cli_options surfaces draft flag', (t) => {
  t.true(parse_cli_options(['--draft']).draft);
  t.false(parse_cli_options([]).draft);
});

test('parse_cli_options surfaces replace-existing flag', (t) => {
  t.true(parse_cli_options(['--replace-existing']).replace_existing);
  t.false(parse_cli_options([]).replace_existing);
});

test('parse_patches reads patch sections from markdown', (t) => {
  const md = ['intro', '## patch `v1.1.0`', '- fix', '## patch `v1.0.0`', '- prev'].join('\n');
  const patches = parse_patches(md);

  t.deepEqual(patches, [
    { version: '1.1.0', body: '- fix' },
    { version: '1.0.0', body: '- prev' },
  ]);
});

test('format_release_notes_content formats latest and previous patches', (t) => {
  const md = ['Intro', '## next patch', '- change', '## patch `v1.0.0`', '- initial'].join('\n');
  const formatted = format_release_notes_content(md, '1.1.0');

  t.true(formatted.includes('Patch v1.1.0'));
  t.true(formatted.includes('Previous patches'));
  t.true(formatted.includes('v1.0.0'));
});

test('write_plugin_release_notes writes formatted content', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-write-'));
  const source = path.join(dir, 'notes.md');
  const output = path.join(dir, 'latest.md');
  const md = ['## next patch', '- change one'].join('\n');

  fs.writeFileSync(source, md);
  write_plugin_release_notes({ release_path: source, output_path: output, version: '1.2.0' });

  t.true(fs.existsSync(output));
  const content = fs.readFileSync(output, 'utf8');
  t.true(content.includes('Patch v1.2.0'));
});

test('formats release notes with nested callouts', (t) => {
  const raw = `## Features\n- Added stuff\n\n## patch \`v1.0.0\`\n- first\n\n## next patch\n- upcoming`;
  const result = format_release_notes_content(raw, '1.0.1');
  t.true(result.includes('> [!NOTE] Patch v1.0.1'));
  t.true(result.includes('> [!NOTE]- Previous patches'));
  t.true(result.includes('> > [!NOTE]- v1.0.0'));
});

test('write_plugin_release_notes writes output without modifying source', (t) => {
  const tmp_dir = fs.mkdtempSync('release-test-');
  const source = path.join(tmp_dir, '3.0.0.md');
  const output = path.join(tmp_dir, 'latest.md');
  const raw = `## next patch\n- upcoming\n\n## patch \`v3.0.0\`\n- first`;
  fs.writeFileSync(source, raw);
  write_plugin_release_notes({ release_path: source, output_path: output, version: '3.0.1' });
  t.is(fs.readFileSync(source, 'utf8'), raw);
  t.true(fs.existsSync(output));
  const out = fs.readFileSync(output, 'utf8');
  t.true(out.includes('Patch v3.0.1'));
});
