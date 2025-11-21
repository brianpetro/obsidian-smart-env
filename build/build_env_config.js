#!/usr/bin/env node
/**
 * obsidian-smart-env/build/build_env_config.js
 *
 * Scans ./src for collections, items, components, and actions (supports sub-folders),
 * generates "./smart_env.config.js" with static import statements.
 *
 * Actions are now flattened like components:
 *   - nested folder/file paths become snake_case keys joined with underscores
 *     e.g. actions/parent/child.js -> actions.parent_child in config
 *   - dots in names are sanitized to underscores: parent.child -> parent_child
 *   - the action's named export may match either the file name ("child") or the
 *     flattened path key ("parent_child").
 *
 * Run: `node obsidian-smart-env/build/build_env_config.js`
 */

import fs from 'fs';
import path from 'path';
import { to_pascal_case } from 'smart-utils/to_pascal_case.js';

const compare_strings = (a, b) => a.localeCompare(b);

export function build_smart_env_config(dist_dir, roots) {
  if (!fs.existsSync(dist_dir)) {
    fs.mkdirSync(dist_dir, { recursive: true });
  }

  const all_collections = {};
  const all_items = {};
  const all_modules = {};
  // components
  const all_components_flat_map = new Map();
  const all_components_config = {};
  // actions
  const all_actions_flat_map = new Map();
  const all_actions_config = {};

  for (const root of roots) {
    Object.assign(all_collections, scan_collections(root));
    Object.assign(all_items, scan_items(root));
    Object.assign(all_modules, scan_modules(root));

    // components
    const { flat: comp_flat, config: comp_config } = scan_components(root);
    comp_flat.forEach(component_entry => {
      all_components_flat_map.set(component_entry.render_import_var, component_entry);
    });
    Object.entries(comp_config).forEach(([key, value]) => {
      all_components_config[key] = value;
    });

    // actions
    const { flat: action_flat, config: action_config } = scan_actions(root);
    action_flat.forEach(entry => {
      all_actions_flat_map.set(entry.action_import_var, entry);
    });
    Object.entries(action_config).forEach(([key, value]) => {
      all_actions_config[key] = value;
    });
  }

  const all_components_flat = Array.from(all_components_flat_map.values())
    .sort((a, b) => compare_strings(a.render_import_var, b.render_import_var));

  const all_actions_flat = Array.from(all_actions_flat_map.values())
    .sort((a, b) => compare_strings(a.action_import_var, b.action_import_var));

  /* ----------  IMPORT STRINGS ---------- */
  const collection_imports = Object.entries(all_collections)
    .sort(([a], [b]) => compare_strings(a, b))
    .map(([name, p]) => `import ${name} from '${p}';`)
    .join('\n');

  const sorted_items = Object.entries(all_items).sort(([a], [b]) => compare_strings(a, b));

  const item_imports = sorted_items
    .map(([, { import_var, import_path }]) => `import { ${import_var} } from '${import_path}';`)
    .join('\n');

  const module_imports = Object.entries(all_modules)
    .sort(([a], [b]) => compare_strings(a, b))
    .map(([name, p]) => `import ${name} from '${p}';`)
    .join('\n');

  const component_imports = all_components_flat
    .map(({ render_import_var, settings_import_var, import_path }) => {
      const specs = [`render as ${render_import_var}`];
      if (settings_import_var) {
        specs.push(`settings_config as ${settings_import_var}`);
      }
      return `import { ${specs.join(', ')} } from '${import_path}';`;
    })
    .join('\n');

  const action_imports = all_actions_flat
    .map(({
      action_export_name,
      action_import_var,
      default_settings_export_name,
      default_settings_import_var,
      settings_export_name,
      settings_import_var,
      display_name_export_name,
      display_name_import_var,
      display_description_export_name,
      display_description_import_var,
      pre_process_export_name,
      pre_process_import_var,
      import_path
    }) => {
      const specs = [`${action_export_name} as ${action_import_var}`];
      if (display_name_export_name) {
        specs.push(`${display_name_export_name} as ${display_name_import_var}`);
      }
      if (display_description_export_name) {
        specs.push(`${display_description_export_name} as ${display_description_import_var}`);
      }
      if (settings_export_name) {
        specs.push(`${settings_export_name} as ${settings_import_var}`);
      }
      if (default_settings_export_name) {
        specs.push(`${default_settings_export_name} as ${default_settings_import_var}`);
      }
      if (pre_process_export_name) {
        specs.push(`${pre_process_export_name} as ${pre_process_import_var}`);
      }
      return `import { ${specs.join(', ')} } from '${import_path}';`;
    })
    .join('\n');

  /* ----------  CONFIG OBJECT STRINGS ---------- */
  const collections_config = obj_keys_to_lines(all_collections, 4).join(',\n');

  const item_types_config = sorted_items
    .map(([, { import_var }]) => `    ${import_var}`)
    .join(',\n');

  const items_config = sorted_items
    .map(([key, { import_var }]) => `    ${key}: { class: ${import_var} }`)
    .join(',\n');

  const modules_config = obj_keys_to_lines(all_modules, 4).join(',\n');
  const components_config = components_to_string(all_components_config, 4);
  const actions_config = actions_to_string(all_actions_config, 4);

  const final_code = [
    '// AUTO-GENERATED by obsidian-smart-env/build/build_env_config.js. DO NOT EDIT.',
    collection_imports,
    item_imports,
    module_imports,
    component_imports,
    action_imports,
    `
export const smart_env_config = {
  collections: {
${collections_config}
  },
  item_types: {
${item_types_config}
  },
  items: {
${items_config}
  },
  modules: {
${modules_config}
  },
  components: {
${components_config}
  },
  actions: {
${actions_config}
  }
};
`
  ].join('\n');

  const out_file = path.join(dist_dir, 'smart_env.config.js');
  fs.writeFileSync(out_file, final_code, 'utf-8');
  console.log(`Wrote ${out_file}`);

  /* ----------  HELPERS ---------- */
  function normalize_relative_path(abs_path) {
    let rel = path.relative(dist_dir, abs_path).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
  }

  function read_dir_sorted(dir_path) {
    return fs.readdirSync(dir_path).sort(compare_strings);
  }

  function scan_collections(base_dir) {
    const dir = path.join(base_dir, 'collections');
    if (!fs.existsSync(dir)) return {};
    return Object.fromEntries(
      read_dir_sorted(dir)
        .filter(f => validate_file_type(f))
        .map(f => [to_snake_case(f.replace('.js', '')), normalize_relative_path(path.join(dir, f))])
    );
  }

  function scan_items(base_dir) {
    const dir = path.join(base_dir, 'items');
    if (!fs.existsSync(dir)) return {};
    const items = {};
    read_dir_sorted(dir)
      .filter(f => validate_file_type(f))
      .forEach(f => {
        const key = to_snake_case(f.replace('.js', ''));
        const import_var = to_pascal_case(key);
        items[key] = { import_var, import_path: normalize_relative_path(path.join(dir, f)) };
      });
    return items;
  }

  function scan_modules(base_dir) {
    const dir = path.join(base_dir, 'modules');
    if (!fs.existsSync(dir)) return {};
    return Object.fromEntries(
      read_dir_sorted(dir)
        .filter(f => validate_file_type(f))
        .map(f => [to_snake_case(f.replace('.js', '')), normalize_relative_path(path.join(dir, f))])
    );
  }

  /**
   * Recursively walks components and builds:
   *   - flat array of {render_import_var, settings_import_var, import_path} (for imports)
   *   - flat config map { [flattened_key]: { render_import_var, settings_import_var? } }
   */
  function scan_components(base_dir) {
    const dir = path.join(base_dir, 'components');
    if (!fs.existsSync(dir)) return { flat: [], config: {} };

    const flat = [];
    const config = {};

    walk(dir, []);

    return { flat, config };

    function walk(curr_dir, rel_parts) {
      read_dir_sorted(curr_dir)
        .forEach(entry => {
          const abs = path.join(curr_dir, entry);
          const is_dir = fs.statSync(abs).isDirectory();
          if (is_dir) {
            walk(abs, [...rel_parts, entry]);
            return;
          }
          if (!validate_file_type(entry)) return;

          const content = fs.readFileSync(abs, 'utf-8');
          if (!has_named_export(content, 'render')) return;
          const has_settings_config = has_named_export(content, 'settings_config');

          const comp_name = entry.replace('.js', '');
          const comp_key = to_snake_case(comp_name);
          const folder_snake = rel_parts.map(to_snake_case);
          const render_import_var = [...folder_snake, comp_key, 'component'].join('_');
          const settings_import_var = has_settings_config ? `${render_import_var}_settings_config` : null;
          const import_path = normalize_relative_path(abs);
          const flattened_key = [...folder_snake, comp_key].filter(Boolean).join('_');
          const config_key = flattened_key || comp_key;

          const prev_idx = flat.findIndex(e => e.render_import_var === render_import_var);
          if (prev_idx !== -1) flat.splice(prev_idx, 1);

          flat.push({ render_import_var, settings_import_var, import_path });

          config[config_key] = { render_import_var };
          if (settings_import_var) {
            config[config_key].settings_import_var = settings_import_var;
          }
        });
    }
  }

  /**
   * Recursively walks actions and builds:
   *   - flat array of import metadata (for import statements)
   *   - flat config map keyed by flattened snake_case path
   *
   * Rules:
   *   - export name can be either the file name (child) or the flattened path name (parent_child)
   *   - actions config uses a flat key like components: parent_child
   */
  function scan_actions(base_dir) {
    const dir = path.join(base_dir, 'actions');
    if (!fs.existsSync(dir)) return { flat: [], config: {} };

    const flat = [];
    const config = {};

    walk(dir, []);

    return { flat, config };

    function walk(curr_dir, rel_parts) {
      read_dir_sorted(curr_dir).forEach(entry => {
        const abs = path.join(curr_dir, entry);
        const is_dir = fs.statSync(abs).isDirectory();
        if (is_dir) {
          walk(abs, [...rel_parts, entry]);
          return;
        }
        if (!validate_file_type(entry)) return;

        const action_name = entry.replace('.js', '');
        const action_key = to_snake_case(action_name);
        const folder_snake = rel_parts.map(to_snake_case);
        const flattened_key = [...folder_snake, action_key].filter(Boolean).join('_');

        const content = fs.readFileSync(abs, 'utf-8');

        const has_file_named_export = has_named_export(content, action_name);
        const has_flat_named_export = has_named_export(content, flattened_key);

        if (!has_file_named_export && !has_flat_named_export) return;

        const action_export_name = has_flat_named_export ? flattened_key : action_name;

        // add default_settings export detection
        const has_default_settings = has_named_export(content, 'default_settings');
        const has_settings_config = has_named_export(content, 'settings_config');
        const has_display_name = has_named_export(content, 'display_name');
        const has_display_description = has_named_export(content, 'display_description');
        const has_pre_process = has_named_export(content, 'pre_process');

        const import_var = [...folder_snake, action_key, 'action'].join('_');
        const import_path = normalize_relative_path(abs);

        const default_settings_import_var = has_default_settings ? `${import_var}_default_settings` : null;
        const settings_import_var = has_settings_config ? `${import_var}_settings_config` : null;
        const display_name_import_var = has_display_name ? `${import_var}_display_name` : null;
        const display_description_import_var = has_display_description ? `${import_var}_display_description` : null;
        const pre_process_import_var = has_pre_process ? `${import_var}_pre_process` : null;

        const prev_idx = flat.findIndex(e => e.action_import_var === import_var);
        if (prev_idx !== -1) flat.splice(prev_idx, 1);

        flat.push({
          action_export_name,
          action_import_var: import_var,
          default_settings_export_name: has_default_settings ? 'default_settings' : null,
          default_settings_import_var,
          settings_export_name: has_settings_config ? 'settings_config' : null,
          settings_import_var,
          display_name_export_name: has_display_name ? 'display_name' : null,
          display_name_import_var,
          display_description_export_name: has_display_description ? 'display_description' : null,
          display_description_import_var,
          pre_process_export_name: has_pre_process ? 'pre_process' : null,
          pre_process_import_var,
          import_path
        });

        config[flattened_key] = { action_import_var: import_var };
        if (has_default_settings) {
          config[flattened_key].default_settings_import_var = default_settings_import_var;
        }
        if (has_display_name) {
          config[flattened_key].display_name_import_var = display_name_import_var;
        }
        if (has_display_description) {
          config[flattened_key].display_description_import_var = display_description_import_var;
        }
        if (has_settings_config) {
          config[flattened_key].settings_import_var = settings_import_var;
        }
        if (has_pre_process) {
          config[flattened_key].pre_process_import_var = pre_process_import_var;
        }
      });
    }
  }

  /* ----- util helpers ----- */
  function to_snake_case(s) {
    return s
      .replace(/[.\-\s]+/g, '_')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  function obj_keys_to_lines(obj, indent = 2) {
    const spacer = ' '.repeat(indent);
    return Object.keys(obj)
      .sort(compare_strings)
      .map(k => `${spacer}${k}`);
  }

  function components_to_string(node, indent = 2) {
    const spacer = ' '.repeat(indent);
    return Object.entries(node)
      .sort(([a], [b]) => compare_strings(a, b))
      .map(([k, v]) => {
        const inner = [`render: ${v.render_import_var}`];
        if (v.settings_import_var) inner.push(`settings_config: ${v.settings_import_var}`);
        return `${spacer}${k}: { ${inner.join(', ')} }`;
      })
      .join(',\n');
  }

  function actions_to_string(node, indent = 2) {
    const spacer = ' '.repeat(indent);
    return Object.entries(node)
      .sort(([a], [b]) => compare_strings(a, b))
      .map(([k, v]) => {
        const inner = [`action: ${v.action_import_var}`];
        if (v.display_name_import_var) inner.push(`display_name: ${v.display_name_import_var}`);
        if (v.display_description_import_var) inner.push(`display_description: ${v.display_description_import_var}`);
        if (v.settings_import_var) inner.push(`settings_config: ${v.settings_import_var}`);
        if (v.default_settings_import_var) inner.push(`default_settings: ${v.default_settings_import_var}`);
        if (v.pre_process_import_var) inner.push(`pre_process: ${v.pre_process_import_var}`);
        return `${spacer}${k}: { ${inner.join(', ')} }`;
      })
      .join(',\n');
  }
}

function validate_file_type(f) {
  if (f.endsWith('.test.js')) return false;
  if (f.endsWith('.spec.js')) return false;
  return f.endsWith('.js');
}

function has_named_export(content, name) {
  if (content.includes(`export function ${name}`)) return true;
  if (content.includes(`export async function ${name}`)) return true;
  if (content.includes(`export const ${name}`)) return true;
  if (content.includes(`export let ${name}`)) return true;
  if (content.includes(`export var ${name}`)) return true;
  return new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(content);
}
