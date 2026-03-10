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
 * Create a path tree node that preserves first-seen child order.
 *
 * @returns {{ children: Array<{ type: 'dir', name: string, node: any } | { type: 'file', target: string }>, dir_nodes: Map<string, any>, file_targets: Set<string> }}
 */
function create_tree_node() {
  return {
    children: [],
    dir_nodes: new Map(),
    file_targets: new Set(),
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
    const normalized_key = normalize_context_item_key(item?.key);
    if (!normalized_key || seen_keys.has(normalized_key)) continue;
    seen_keys.add(normalized_key);

    const is_folder = Boolean(item?.data?.folder) || normalized_key.endsWith('/');
    const path_segments = split_path_segments(normalized_key);
    if (!path_segments.length) continue;

    if (is_folder) {
      ensure_path(root_node, path_segments);
      continue;
    }

    const file_segment = path_segments.pop();
    const parent_node = ensure_path(root_node, path_segments);
    const wikilink_target = format_wikilink_target(file_segment);
    if (!wikilink_target || parent_node.file_targets.has(wikilink_target)) continue;

    parent_node.file_targets.add(wikilink_target);
    parent_node.children.push({
      type: 'file',
      target: wikilink_target,
    });
  }

  return render_tree_lines(root_node).join('\n');
}