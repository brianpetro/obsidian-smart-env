#!/usr/bin/env node
/**
 * build_smart_env_config.js
 *
 * Scans ./src for collections, items, and components (supports sub-folders),
 * generates "dist/smart_env.config.js" with static import statements.
 *
 * Run: `node build_smart_env_config.js`
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { to_pascal_case } from 'smart-utils/to_pascal_case.js';

export function build_smart_env_config(dist_dir, roots) {
  if (!fs.existsSync(dist_dir)) {
    fs.mkdirSync(dist_dir, { recursive: true });
  }

  const all_collections = {};
  const all_items = {};
  // Use a Map to ensure only the latest import_var is kept
  const all_components_flat_map = new Map();
  const all_components_nested = {};

  for (const root of roots) {
    Object.assign(all_collections, scan_collections(root));
    Object.assign(all_items, scan_items(root));
    const { flat, nested } = scan_components(root);
    // For each component, overwrite previous entry with same import_var
    flat.forEach(({ import_var, import_path }) => {
      all_components_flat_map.set(import_var, { import_var, import_path });
    });
    deep_merge(all_components_nested, nested);
  }

  const all_components_flat = Array.from(all_components_flat_map.values());

  /* ----------  IMPORT STRINGS ---------- */
  const collection_imports = Object.entries(all_collections)
    .map(([name, p]) => `import ${name} from '${p}';`)
    .join('\n');

  const item_imports = Object.values(all_items)
    .map(({ import_var, import_path }) => `import { ${import_var} } from '${import_path}';`)
    .join('\n');

  const component_imports = all_components_flat
    .map(({ import_var, import_path }) => `import { render as ${import_var} } from '${import_path}';`)
    .join('\n');

  /* ----------  CONFIG OBJECT STRINGS ---------- */
  const collections_config = obj_keys_to_lines(all_collections, 4).join(',\n');

  const items_config = Object.values(all_items)
    .map(({ import_var }) => `    ${import_var}`)
    .join(',\n');

  const components_config = components_to_string(all_components_nested, 4);

  const final_code = [
    '// AUTO-GENERATED by build_smart_env_config.js. DO NOT EDIT.',
    collection_imports,
    item_imports,
    component_imports,
    `
export const smart_env_config = {
  collections: {
${collections_config}
  },
  item_types: {
${items_config}
  },
  components: {
${components_config}
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

  function scan_collections(base_dir) {
    const dir = path.join(base_dir, 'collections');
    if (!fs.existsSync(dir)) return {};
    return Object.fromEntries(
      fs.readdirSync(dir)
        .filter(f => validate_file_type(f))
        .map(f => [f.replace('.js', ''), normalize_relative_path(path.join(dir, f))])
    );
  }

  function scan_items(base_dir) {
    const dir = path.join(base_dir, 'items');
    if (!fs.existsSync(dir)) return {};
    const items = {};
    fs.readdirSync(dir)
      .filter(f => validate_file_type(f))
      .forEach(f => {
        const key = f.replace('.js', '');
        const import_var = to_pascal_case(key);
        items[key] = { import_var, import_path: normalize_relative_path(path.join(dir, f)) };
      });
    return items;
  }

  /**
   * Recursively walks components and builds:
   *   - flat array of {import_var, import_path}   (for imports)
   *   - nested object describing final config tree
   */
  function scan_components(base_dir) {
    const dir = path.join(base_dir, 'components');
    if (!fs.existsSync(dir)) return { flat: [], nested: {} };

    const flat = [];
    const nested = {};

    walk(dir, []);

    return { flat, nested };

    /* ----- local ----- */
    function walk(curr_dir, rel_parts) {
      fs.readdirSync(curr_dir)
        .filter(entry => validate_file_type(entry))
        .forEach(entry => {
          const abs = path.join(curr_dir, entry);
          const is_dir = fs.statSync(abs).isDirectory();
          if (is_dir) {
            walk(abs, [...rel_parts, entry]);
            return;
          }
          if (!entry.endsWith('.js')) return;

          // skip if no "function render" export
          const content = fs.readFileSync(abs, 'utf-8');
          if (
            !content.includes('function render')
            && !content.includes('render =')
          ) return;

          const comp_name = entry.replace('.js', '');
          const folder_snake = rel_parts.map(to_snake_case);
          const import_var = [...folder_snake, comp_name, 'component'].join('_');
          const import_path = normalize_relative_path(abs);

          // Remove previous entry with same import_var (keep newer)
          const prevIdx = flat.findIndex(e => e.import_var === import_var);
          if (prevIdx !== -1) flat.splice(prevIdx, 1);

          /* flat list */
          flat.push({ import_var, import_path });

          /* nested object */
          let node = nested;
          for (const part of folder_snake) {
            if (!node[part]) node[part] = {};
            node = node[part];
          }
          node[comp_name] = { import_var };
        });
      ;
    }
  }

  /* ----- util helpers ----- */
  function to_snake_case(s) {
    return s
      .replace(/[-\s]+/g, '_')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }
  function obj_keys_to_lines(obj, indent = 2) {
    const spacer = ' '.repeat(indent);
    return Object.keys(obj).map(k => `${spacer}${k}`);
  }
  function deep_merge(target, src) {
    Object.entries(src).forEach(([k, v]) => {
      if (typeof v === 'object' && !Array.isArray(v)) {
        if (!target[k]) target[k] = {};
        deep_merge(target[k], v);
      } else {
        target[k] = v;
      }
    });
  }
  function components_to_string(node, indent = 2) {
    const spacer = ' '.repeat(indent);
    const parts = [];
    Object.entries(node).forEach(([k, v]) => {
      if (v.import_var) {
        parts.push(`${spacer}${k}: ${v.import_var}`);
      } else {
        const inner = components_to_string(v, indent + 2);
        parts.push(`${spacer}${k}: {\n${inner}\n${spacer}}`);
      }
    });
    return parts.join(',\n');
  }
}
function validate_file_type(f) {
  if(f.endsWith('.test.js')) return false;
  if(f.endsWith('.spec.js')) return false;
  return f.endsWith('.js');
}

