import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'ava';
import { build_plugin } from './build_plugin.js';

function create_build_fixture(t) {
  const root_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-plugin-'));
  const cwd = path.join(root_dir, 'plugin-repo');
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  fs.writeFileSync(path.join(cwd, 'manifest.json'), JSON.stringify({ id: 'test-plugin' }));
  fs.writeFileSync(path.join(cwd, 'styles.css'), 'body {}');

  t.teardown(() => {
    fs.rmSync(root_dir, { recursive: true, force: true });
  });

  return {
    cwd,
    root_dir,
    esbuild: {
      async build(options) {
        fs.writeFileSync(options.outfile, 'module.exports = {};');
      },
    },
  };
}

test('build_plugin appends the default Obsidian plugins path for vault folders', async (t) => {
  const fixture = create_build_fixture(t);

  await build_plugin({
    cwd: fixture.cwd,
    destination_vaults: ['Test Vault'],
    esbuild: fixture.esbuild,
    plugin_id: 'test-plugin',
  });

  const plugin_dir = path.join(
    fixture.root_dir,
    'Test Vault',
    '.obsidian',
    'plugins',
    'test-plugin',
  );
  t.true(fs.existsSync(path.join(plugin_dir, 'main.js')));
  t.true(fs.existsSync(path.join(plugin_dir, 'manifest.json')));
  t.true(fs.existsSync(path.join(plugin_dir, 'styles.css')));
  t.true(fs.existsSync(path.join(plugin_dir, '.hotreload')));
});

test('build_plugin uses configured plugins directories without appending the default path', async (t) => {
  const fixture = create_build_fixture(t);
  const standard_plugins_dir = path.join('Test Vault', '.obsidian', 'plugins');
  const alternate_plugins_dir = `${path.join('Test Vault', '.obsidian-mobile', 'plugins')}${path.sep}`;

  await build_plugin({
    cwd: fixture.cwd,
    destination_vaults: `${standard_plugins_dir},${alternate_plugins_dir}`,
    esbuild: fixture.esbuild,
    plugin_id: 'test-plugin',
  });

  for (const plugins_dir of [standard_plugins_dir, alternate_plugins_dir]) {
    const plugin_dir = path.join(fixture.root_dir, plugins_dir, 'test-plugin');
    const duplicated_plugin_dir = path.join(
      fixture.root_dir,
      plugins_dir,
      '.obsidian',
      'plugins',
      'test-plugin',
    );
    t.true(fs.existsSync(path.join(plugin_dir, 'main.js')));
    t.true(fs.existsSync(path.join(plugin_dir, 'manifest.json')));
    t.true(fs.existsSync(path.join(plugin_dir, 'styles.css')));
    t.true(fs.existsSync(path.join(plugin_dir, '.hotreload')));
    t.false(fs.existsSync(duplicated_plugin_dir));
  }
});
