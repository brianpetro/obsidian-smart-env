import fs from 'fs';
import path from 'path';
import { dist_text_plugin } from './dist_js_text.js';

/**
 * Check whether argv includes a CLI flag.
 * @param {string} flag
 * @param {string[]} [argv]
 * @returns {boolean}
 */
function has_cli_flag(flag, argv = process.argv) {
  return argv.includes(flag);
}

/**
 * Get the first non-flag CLI argument after the script path.
 * @param {string} default_entry_point
 * @param {string[]} [argv]
 * @returns {string}
 */
function get_cli_entry_point(default_entry_point, argv = process.argv) {
  const cli_args = argv.slice(2);
  const entry_point = cli_args.find((arg) => !arg.startsWith('--'));
  return entry_point || default_entry_point;
}

/**
 * Create the shared markdown import plugin.
 * @returns {import('esbuild').Plugin}
 */
function create_markdown_plugin() {
  return {
    name: 'markdown',
    setup(build) {
      build.onLoad({ filter: /\.md$/ }, async (args) => {
        if (args.with && args.with.type === 'markdown') {
          const text = await fs.promises.readFile(args.path, 'utf8');
          return {
            contents: `export default ${JSON.stringify(text)};`,
            loader: 'js',
          };
        }

        return null;
      });
    },
  };
}

/**
 * Ensure a directory exists.
 * @param {string} dir_path
 */
function ensure_dir(dir_path) {
  if (!fs.existsSync(dir_path)) {
    fs.mkdirSync(dir_path, { recursive: true });
  }
}

/**
 * Read JSON from disk.
 * @param {string} file_path
 * @returns {any}
 */
function read_json(file_path) {
  return JSON.parse(fs.readFileSync(file_path, 'utf8'));
}

/**
 * Normalize destination vault names from a string or array.
 * @param {string|string[]|undefined} destination_vaults
 * @returns {string[]}
 */
function normalize_destination_vaults(destination_vaults) {
  if (Array.isArray(destination_vaults)) {
    return destination_vaults
      .map((vault_name) => String(vault_name).trim())
      .filter(Boolean);
  }

  return String(destination_vaults || '')
    .split(',')
    .map((vault_name) => vault_name.trim())
    .filter(Boolean);
}

/**
 * Write the bundled styles file to dist.
 * @param {{style_sources: string[], dist_styles_path: string, style_joiner?: string}} options
 */
function write_dist_styles(options) {
  const { style_sources, dist_styles_path, style_joiner = '\n' } = options;
  const style_parts = style_sources.map((style_path) => fs.readFileSync(style_path, 'utf8'));
  fs.writeFileSync(dist_styles_path, style_parts.join(style_joiner));
}

/**
 * Copy release files to a vault directory.
 * @param {string[]} release_file_paths
 * @param {string} dest_dir
 */
function copy_release_files(release_file_paths, dest_dir) {
  release_file_paths.forEach((file_path) => {
    fs.copyFileSync(file_path, path.join(dest_dir, path.basename(file_path)));
  });
}

/**
 * Build an Obsidian plugin bundle and optionally copy the packaged files to vaults.
 * @param {{
 *   argv?: string[],
 *   esbuild: typeof import('esbuild'),
 *   cwd?: string,
 *   plugin_id?: string,
 *   entry_point?: string,
 *   entry_point_from_argv?: boolean,
 *   minify?: boolean,
 *   minify_from_argv?: boolean,
 *   keep_names?: boolean,
 *   package_json_path?: string,
 *   manifest_path?: string,
 *   dist_dir?: string,
 *   main_path?: string,
 *   dist_manifest_path?: string,
 *   styles_path?: string,
 *   style_sources?: string[],
 *   dist_styles_path?: string,
 *   style_joiner?: string,
 *   env_config_builder?: (output_dir: string, roots: string[]) => void,
 *   env_config_output_dir?: string,
 *   env_config_roots?: string[],
 *   format?: import('esbuild').Format,
 *   platform?: import('esbuild').Platform,
 *   target?: string | string[],
 *   sourcemap?: boolean | 'linked' | 'inline' | 'external' | 'both',
 *   external?: string[],
 *   define?: Record<string, string>,
 *   loader?: Record<string, import('esbuild').Loader>,
 *   plugins?: import('esbuild').Plugin[],
 *   banner?: string,
 *   build_banner?: (pkg: any) => string,
 *   destination_vaults?: string | string[],
 *   destination_vaults_env?: string,
 *   release_file_paths?: string[],
 *   copy_to_vaults?: boolean,
 * }} options
 * @returns {Promise<{package_json: any, manifest_json: any, release_file_paths: string[]}>}
 */
async function build_plugin(options = {}) {
  if (!options.esbuild) {
    throw new Error('esbuild is required. Pass the local esbuild instance from the plugin repo.');
  }

  const argv = options.argv || process.argv;
  const cwd = options.cwd || process.cwd();
  const dist_dir = options.dist_dir || path.join(cwd, 'dist');
  const main_path = options.main_path || path.join(dist_dir, 'main.js');
  const package_json_path = options.package_json_path || path.join(cwd, 'package.json');
  const manifest_path = options.manifest_path || path.join(cwd, 'manifest.json');
  const dist_manifest_path = options.dist_manifest_path || path.join(dist_dir, 'manifest.json');
  const resolved_style_sources = options.style_sources || [
    options.styles_path || path.join(cwd, 'styles.css'),
  ];
  const dist_styles_path = options.dist_styles_path || path.join(dist_dir, 'styles.css');
  const entry_point = options.entry_point_from_argv
    ? get_cli_entry_point(options.entry_point || 'src/main.js', argv)
    : (options.entry_point || 'src/main.js');
  const minify = options.minify_from_argv
    ? has_cli_flag('--minify', argv)
    : Boolean(options.minify);
  const destination_vaults = normalize_destination_vaults(
    options.destination_vaults ?? process.env[options.destination_vaults_env || 'DESTINATION_VAULTS'],
  );

  if (options.env_config_builder) {
    options.env_config_builder(
      options.env_config_output_dir || cwd,
      options.env_config_roots || [path.resolve(cwd, 'src')],
    );
  }

  ensure_dir(dist_dir);

  const package_json = read_json(package_json_path);
  const manifest_json = read_json(manifest_path);
  manifest_json.version = package_json.version;
  fs.writeFileSync(manifest_path, JSON.stringify(manifest_json, null, 2));
  fs.copyFileSync(manifest_path, dist_manifest_path);

  if (resolved_style_sources.length) {
    write_dist_styles({
      style_sources: resolved_style_sources,
      dist_styles_path,
      style_joiner: options.style_joiner,
    });
  }

  const copyright_banner = options.banner || (
    typeof options.build_banner === 'function'
      ? options.build_banner(package_json)
      : undefined
  );

  await options.esbuild.build({
    entryPoints: [entry_point],
    outfile: main_path,
    format: options.format || 'cjs',
    bundle: true,
    write: true,
    sourcemap: options.sourcemap,
    target: options.target || 'es2022',
    logLevel: 'info',
    treeShaking: true,
    platform: options.platform || 'node',
    preserveSymlinks: true,
    external: Array.from(
      new Set([
        'electron',
        'obsidian',
        'crypto',
        ...(options.external || []),
      ]),
    ),
    define: options.define || {},
    loader: {
      '.css': 'text',
      '.worker.js': 'text',
      ...(options.loader || {}),
    },
    plugins: [
      create_markdown_plugin(),
      dist_text_plugin(),
      ...(options.plugins || []),
    ],
    banner: copyright_banner ? { js: copyright_banner } : undefined,
    minify,
    keepNames: options.keep_names,
  });

  console.log('Build complete');

  const release_file_paths = options.release_file_paths || [
    dist_manifest_path,
    ...(fs.existsSync(dist_styles_path) ? [dist_styles_path] : []),
    main_path,
  ];

  if (options.copy_to_vaults !== false) {
    if (destination_vaults.length && !options.plugin_id) {
      throw new Error('plugin_id is required when DESTINATION_VAULTS is configured.');
    }

    for (const vault_name of destination_vaults) {
      const dest_dir = path.join(
        cwd,
        '..',
        vault_name,
        '.obsidian',
        'plugins',
        options.plugin_id,
      );
      console.log(`Copying files to ${dest_dir}`);
      ensure_dir(dest_dir);

      const hotreload_path = path.join(dest_dir, '.hotreload');
      if (!fs.existsSync(hotreload_path)) {
        fs.writeFileSync(hotreload_path, '');
      }

      copy_release_files(release_file_paths, dest_dir);
      console.log(`Copied files to ${dest_dir}`);
    }
  }

  return {
    package_json,
    manifest_json,
    release_file_paths,
  };
}

export {
  build_plugin,
  create_markdown_plugin,
  get_cli_entry_point,
  has_cli_flag,
};
