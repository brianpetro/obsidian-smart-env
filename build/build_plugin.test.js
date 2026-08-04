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

/**
 * Create an esbuild stub that runs plugin onEnd callbacks with stylesheet inputs.
 * @param {string[]} imported_style_paths
 * @returns {{build: (options: any) => Promise<void>}}
 */
function create_imported_styles_esbuild(imported_style_paths) {
  return {
    async build(options) {
      const on_end_callbacks = [];
      const build = {
        initialOptions: options,
        onEnd(callback) {
          on_end_callbacks.push(callback);
        },
        onLoad() {},
        onResolve() {},
      };

      options.plugins.forEach((plugin) => plugin.setup(build));
      fs.writeFileSync(options.outfile, 'module.exports = {};');

      const metafile = {
        inputs: Object.fromEntries(
          imported_style_paths.map((file_path) => [file_path, { bytes: 0, imports: [] }]),
        ),
      };

      for (const on_end of on_end_callbacks) {
        await on_end({ errors: [], metafile });
      }
    },
  };
}

test('build_plugin de-duplicates imported styles by content and normalizes source paths', async (t) => {
  const fixture = create_build_fixture(t);
  const local_styles_dir = path.join(fixture.cwd, 'src', 'components');
  const dependency_styles_dir = path.join(
    fixture.cwd,
    'node_modules',
    'smart-view',
    'src',
    'components',
  );
  fs.mkdirSync(local_styles_dir, { recursive: true });
  fs.mkdirSync(dependency_styles_dir, { recursive: true });

  const base_duplicate_path = path.join(local_styles_dir, 'base_duplicate.css');
  const local_style_path = path.join(local_styles_dir, 'local.css');
  const duplicate_style_path = path.join(dependency_styles_dir, 'duplicate.css');
  const dependency_style_path = path.join(dependency_styles_dir, 'dependency.css');
  const shared_style_content = '.shared { display: block; }';
  const dependency_style_content = '.dependency { color: blue; }';
  fs.writeFileSync(base_duplicate_path, 'body {}');
  fs.writeFileSync(local_style_path, shared_style_content);
  fs.writeFileSync(duplicate_style_path, shared_style_content);
  fs.writeFileSync(dependency_style_path, dependency_style_content);

  await build_plugin({
    copy_to_vaults: false,
    cwd: fixture.cwd,
    esbuild: create_imported_styles_esbuild([
      base_duplicate_path,
      local_style_path,
      duplicate_style_path,
      dependency_style_path,
    ]),
  });

  const dist_styles = fs.readFileSync(path.join(fixture.cwd, 'dist', 'styles.css'), 'utf8');
  t.is(dist_styles.split(shared_style_content).length - 1, 1);
  t.is(dist_styles.split(dependency_style_content).length - 1, 1);
  t.true(dist_styles.includes('/* Imported from: plugin-repo/src/components/local.css */'));
  t.true(dist_styles.includes('/* Imported from: smart-view/src/components/dependency.css */'));
  t.false(dist_styles.includes(fixture.root_dir));
  t.false(dist_styles.includes('node_modules'));
});
