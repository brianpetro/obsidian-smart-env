import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Normalize a Smart Context item key for wikilink tree output.
 *
 * - Strips Smart Context transport prefixes like `external:` and `selection:`.
 * - Normalizes path separators to `/`.
 * - Preserves relative path segments like `..`.
 *
 * @param {string} key
 * @returns {string}
 */
export function normalize_context_item_key(key = '') {
  if (typeof key !== 'string') return '';
  return key
    .trim()
    .replace(/^external:/, '')
    .replace(/^selection:/, '')
    .replace(/\\+/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
  ;
}

/**
 * Parse a Smart Context item key into normalized and display variants.
 *
 * External keys intentionally hide the synthetic leading `../` from the
 * rendered tree because it represents the parent directory of the vault,
 * not a folder that should appear in the export.
 *
 * @param {string} key
 * @returns {{
 *   raw_key: string,
 *   normalized_key: string,
 *   display_key: string,
 *   is_external: boolean,
 *   is_selection: boolean,
 * }}
 */
function parse_context_item_key(key = '') {
  const raw_key = typeof key === 'string' ? key.trim() : '';
  const is_external = raw_key.startsWith('external:');
  const is_selection = raw_key.startsWith('selection:');
  const normalized_key = normalize_context_item_key(raw_key);

  let display_key = normalized_key;
  if (is_external && display_key.startsWith('../')) {
    display_key = display_key.slice(3);
  }

  return {
    raw_key,
    normalized_key,
    display_key,
    is_external,
    is_selection,
  };
}

/**
 * Split a normalized path into non-empty segments.
 *
 * @param {string} normalized_key
 * @returns {string[]}
 */
function split_path_segments(normalized_key = '') {
  if (typeof normalized_key !== 'string' || normalized_key.length === 0) return [];
  return normalized_key
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  ;
}

/**
 * Convert a file-like path segment into an Obsidian wikilink target.
 *
 * Examples:
 * - `note.md` -> `note`
 * - `note.md#Heading` -> `note#Heading`
 * - `image.png` -> `image.png`
 *
 * @param {string} file_segment
 * @returns {string}
 */
export function format_wikilink_target(file_segment = '') {
  if (typeof file_segment !== 'string') return '';
  const trimmed = file_segment.trim();
  if (!trimmed) return '';

  const hash_index = trimmed.indexOf('#');
  if (hash_index === -1) {
    return trimmed.replace(/\.md$/i, '');
  }

  const source_name = trimmed.slice(0, hash_index).replace(/\.md$/i, '');
  const fragment = trimmed.slice(hash_index);
  return `${source_name}${fragment}`;
}

/**
 * Escape a Markdown link label.
 *
 * @param {string} text
 * @returns {string}
 */
function escape_markdown_link_text(text = '') {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]')
  ;
}

/**
 * Create a path tree node that preserves first-seen child order.
 *
 * @returns {{
 *   children: Array<
 *     | { type: 'dir', name: string, node: any }
 *     | { type: 'file', target: string }
 *     | { type: 'external_file', label: string, href: string }
 *   >,
 *   dir_nodes: Map<string, any>,
 *   file_keys: Set<string>,
 * }}
 */
function create_tree_node() {
  return {
    children: [],
    dir_nodes: new Map(),
    file_keys: new Set(),
  };
}

/**
 * Ensure a directory child exists on a node.
 *
 * @param {{ children: Array<any>, dir_nodes: Map<string, any> }} node
 * @param {string} dir_name
 * @returns {ReturnType<typeof create_tree_node>}
 */
function ensure_dir_node(node, dir_name) {
  const existing = node.dir_nodes.get(dir_name);
  if (existing) return existing;

  const dir_node = create_tree_node();
  node.dir_nodes.set(dir_name, dir_node);
  node.children.push({
    type: 'dir',
    name: dir_name,
    node: dir_node,
  });
  return dir_node;
}

/**
 * Walk or create directory nodes for the provided segments.
 *
 * @param {ReturnType<typeof create_tree_node>} root_node
 * @param {string[]} dir_segments
 * @returns {ReturnType<typeof create_tree_node>}
 */
function ensure_path(root_node, dir_segments = []) {
  let node = root_node;
  for (let i = 0; i < dir_segments.length; i += 1) {
    node = ensure_dir_node(node, dir_segments[i]);
  }
  return node;
}

/**
 * Resolve the current vault's absolute base path from Obsidian internals.
 *
 * Desktop `FileSystemAdapter` exposes `getBasePath()`. Mobile adapters expose
 * `getFullPath(normalizedPath)`, so `getFullPath('')` is used as a best-effort
 * fallback when available.
 *
 * @param {import('smart-contexts').SmartContext|any} smart_context
 * @returns {string}
 */
function get_vault_base_path(smart_context) {
  const app = smart_context?.env?.plugin?.app
    || smart_context?.env?.app
    || smart_context?.app
    || globalThis.app
    || null
  ;
  const adapter = app?.vault?.adapter;
  if (!adapter) return '';

  if (typeof adapter.getBasePath === 'function') {
    const base_path = adapter.getBasePath();
    if (typeof base_path === 'string' && base_path.trim()) {
      return base_path.trim();
    }
  }

  if (typeof adapter.getFullPath === 'function') {
    try {
      const full_path = adapter.getFullPath('');
      if (typeof full_path === 'string' && full_path.trim()) {
        return full_path.trim();
      }
    } catch (err) {
      /* no-op */
    }
  }

  if (typeof adapter.basePath === 'string' && adapter.basePath.trim()) {
    return adapter.basePath.trim();
  }

  return '';
}

/**
 * Resolve an external Smart Context key into a file URL.
 *
 * @param {import('smart-contexts').SmartContext|any} smart_context
 * @param {string} key
 * @returns {string}
 */
function resolve_external_href(smart_context, key = '') {
  const parsed = parse_context_item_key(key);
  if (!parsed.is_external) return '';
  if (!parsed.normalized_key) return '';

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(parsed.normalized_key)) {
    return parsed.normalized_key;
  }

  const vault_base_path = get_vault_base_path(smart_context);
  if (!vault_base_path) {
    return parsed.normalized_key;
  }

  const absolute_path = path.resolve(vault_base_path, parsed.normalized_key);
  return pathToFileURL(absolute_path).href;
}

/**
 * Render a path tree into the same bullet/tab structure.
 *
 * @param {ReturnType<typeof create_tree_node>} node
 * @param {number} depth
 * @param {string[]} lines
 * @returns {string[]}
 */
function render_tree_lines(node, depth = 0, lines = []) {
  for (let i = 0; i < node.children.length; i += 1) {
    const child = node.children[i];
    if (!child) continue;

    if (child.type === 'dir') {
      lines.push(`${'\t'.repeat(depth)}- ${child.name}`);
      render_tree_lines(child.node, depth + 1, lines);
      continue;
    }

    if (child.type === 'external_file') {
      const safe_label = escape_markdown_link_text(child.label);
      lines.push(`${'\t'.repeat(depth)}- [${safe_label}](${child.href})`);
      continue;
    }

    if (child.type === 'file') {
      lines.push(`${'\t'.repeat(depth)}- [[${child.target}]]`);
    }
  }
  return lines;
}

/**
 * Collect active context items from a SmartContext instance.
 *
 * Prefers `smart_context.context_items.filter(...)` so the function works from the
 * live ContextItems collection. Falls back to raw `data.context_items` when needed.
 *
 * @param {import('smart-contexts').SmartContext|any} smart_context
 * @returns {Array<{ key: string, data?: Record<string, any> }>}
 */
function list_context_items(smart_context) {
  const collection = smart_context?.context_items;

  if (collection && typeof collection.filter === 'function') {
    return collection.filter((item) => {
      if (!item?.key) return false;
      if (item?.data?.exclude) return false;
      return true;
    });
  }

  const raw_items = smart_context?.data?.context_items;
  if (!raw_items || typeof raw_items !== 'object') return [];

  return Object.entries(raw_items)
    .filter(([key, item_data]) => {
      if (!key) return false;
      if (item_data?.exclude) return false;
      return true;
    })
    .map(([key, item_data]) => ({ key, data: item_data || {} }))
  ;
}

/**
 * Build a wikilink tree for a SmartContext using its context_items collection.
 *
 * External items are rendered as Markdown file links with absolute `file://`
 * URLs resolved from the vault root path.
 *
 * @param {import('smart-contexts').SmartContext|any} smart_context
 * @returns {string}
 */
export function context_to_md_tree(smart_context) {
  const items = list_context_items(smart_context);
  if (!items.length) return '';

  const root_node = create_tree_node();
  const seen_keys = new Set();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const parsed_key = parse_context_item_key(item?.key);
    if (!parsed_key.raw_key || seen_keys.has(parsed_key.raw_key)) continue;
    seen_keys.add(parsed_key.raw_key);

    const raw_folder_value = item?.data?.folder;
    const normalized_folder_value = typeof raw_folder_value === 'string'
      ? normalize_context_item_key(raw_folder_value)
      : ''
    ;
    const is_folder = raw_folder_value === true
      || parsed_key.display_key.endsWith('/')
      || parsed_key.normalized_key.endsWith('/')
      || (
        normalized_folder_value.length > 0
        && normalized_folder_value === parsed_key.normalized_key
      )
    ;
    const path_segments = split_path_segments(parsed_key.display_key);
    if (!path_segments.length) continue;

    if (is_folder) {
      ensure_path(root_node, path_segments);
      continue;
    }

    const file_segment = path_segments.pop();
    const parent_node = ensure_path(root_node, path_segments);

    if (parsed_key.is_external) {
      const href = resolve_external_href(smart_context, parsed_key.raw_key);
      if (!href) continue;

      const external_key = `external:${href}`;
      if (parent_node.file_keys.has(external_key)) continue;
      parent_node.file_keys.add(external_key);
      parent_node.children.push({
        type: 'external_file',
        label: file_segment,
        href,
      });
      continue;
    }

    const wikilink_target = format_wikilink_target(file_segment);
    if (!wikilink_target) continue;

    const internal_key = `internal:${wikilink_target}`;
    if (parent_node.file_keys.has(internal_key)) continue;

    parent_node.file_keys.add(internal_key);
    parent_node.children.push({
      type: 'file',
      target: wikilink_target,
    });
  }

  return render_tree_lines(root_node).join('\n');
}