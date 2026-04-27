import { build_tree_item } from './build_tree_item.js';

export function build_tree_html(items) {
  const tree_root = build_path_tree(items);
  const selected_set = new Set(items.map((it) => it.key || it.path));
  const tree_list_html = tree_to_html(tree_root, selected_set);
  return tree_list_html;
}

/**
 * build_path_tree
 * Convert an array of selected items into a nested directory tree while
 * removing redundant paths (i.e. children of a selected folder).
 *
 * In addition, recognise Obsidian block-key syntax. When encountered, the
 * block path is treated as tree segments after the source file it belongs to.
 * Any forward-slashes or hashtags that appear inside wikilinks must not be
 * interpreted as tree separators.
 *
 * @param {Array<import('smart-contexts').ContextItem>} selected_items
 * @returns {Object} root tree node
 */
export function build_path_tree(selected_items = []) {
  /**
   * @param {import('smart-contexts').ContextItem} item
   * @returns {string}
   */
  const get_item_key = (item) => item?.key || item?.path || '';

  /**
   * @param {string} value
   * @returns {number}
   */
  const find_first_block_separator = (value = '') => {
    let in_wikilink = false;
    for (let i = 0; i < value.length; i++) {
      if (!in_wikilink && value.slice(i, i + 2) === '[[') {
        in_wikilink = true;
        i++;
        continue;
      }
      if (in_wikilink && value.slice(i, i + 2) === ']]') {
        in_wikilink = false;
        i++;
        continue;
      }
      if (!in_wikilink && value[i] === '#') return i;
    }
    return -1;
  };

  /**
   * @param {string} source_path
   * @returns {string[]}
   */
  const split_source_path_segments = (source_path = '') => {
    const segments = [];
    let seg = '';
    let in_wikilink = false;

    for (let i = 0; i < source_path.length; i++) {
      if (!in_wikilink && source_path.slice(i, i + 2) === '[[') {
        in_wikilink = true;
        seg += '[[';
        i++;
        continue;
      }
      if (in_wikilink && source_path.slice(i, i + 2) === ']]') {
        in_wikilink = false;
        seg += ']]';
        i++;
        continue;
      }
      if (!in_wikilink && source_path[i] === '/') {
        if (seg) segments.push(seg);
        seg = '';
        continue;
      }
      seg += source_path[i];
    }

    if (seg) segments.push(seg);
    return segments;
  };

  /**
   * @param {string} block_path
   * @returns {string[]}
   */
  const split_block_path_segments = (block_path = '') => {
    const segments = [];
    let seg = '';
    let in_wikilink = false;

    for (let i = 0; i < block_path.length; i++) {
      if (!in_wikilink && block_path.slice(i, i + 2) === '[[') {
        in_wikilink = true;
        seg += '[[';
        i++;
        continue;
      }
      if (in_wikilink && block_path.slice(i, i + 2) === ']]') {
        in_wikilink = false;
        seg += ']]';
        i++;
        continue;
      }
      if (!in_wikilink && block_path[i] === '#') {
        if (seg) {
          segments.push(seg);
          seg = '';
        }
        if (block_path[i + 1] === '#') {
          seg = '#';
          while (block_path[i + 1] === '#') {
            i++;
            seg += '#';
          }
        } else if (block_path[i + 1] === '{') {
          seg = '#';
        }
        continue;
      }
      seg += block_path[i];
    }

    if (seg) segments.push(seg);
    return segments;
  };

  /**
   * split_path_segments
   * Expand an item path into an ordered list of tree segments, correctly
   * handling block-key syntax.
   *
   * @param {string} item_path
   * @returns {{ segments:string[], has_block:boolean, source_segments_count:number }}
   */
  const split_path_segments = (item_path) => {
    const block_idx = find_first_block_separator(item_path);
    const has_block = block_idx !== -1;
    const source_path = has_block ? item_path.slice(0, block_idx) : item_path;
    const block_path = has_block ? item_path.slice(block_idx) : '';
    const source_segments = split_source_path_segments(source_path);
    const segments = [...source_segments];

    if (block_path) {
      segments.push(...split_block_path_segments(block_path));
    }

    return { segments, has_block, source_segments_count: source_segments.length };
  };

  // Build tree
  const root = { name: '', children: {}, selected: false };

  // WARNING: PREVENTS TREE RENDER IF "GROUP"-type ContextItems instances present (skipping group-type instances for now)
  const is_redundant = (p, selected_folders) =>
    selected_folders.some((folder) => p.startsWith(`${folder}/`));

  // Determine which user-selected items are folders so we can skip redundant children
  const selected_folders = selected_items
    .filter((it) => {
      const item_key = get_item_key(it);
      if (!item_key) return false;
      const for_ext_check = item_key.includes('#')
        ? item_key.split('#')[0]
        : item_key;
      return !for_ext_check.match(/\.[a-zA-Z0-9]+$/u);
    })
    .map((it) => get_item_key(it))
    .filter(Boolean);

  for (const item of selected_items) {
    const item_key = get_item_key(item);
    const exists = item?.exists;
    if (!item_key) continue;
    if (is_redundant(item_key, selected_folders.filter((p) => p !== item_key))) continue;

    const { segments, has_block, source_segments_count } = split_path_segments(item_key);

    let node = root;
    let running = '';

    segments.forEach((seg, idx) => {
      // Always update the running path, even if skipping as a child
      if (!running) {
        running = seg;
      } else if (has_block && idx >= source_segments_count) {
        running = seg.startsWith('#') ? `${running}${seg}` : `${running}#${seg}`;
      } else {
        running = `${running}/${seg}`;
      }

      // Skip adding "external:.." as a child node, but keep it in path properties
      if (seg.startsWith('external:..')) return;

      const is_last = idx === segments.length - 1;
      const is_block_leaf = is_last && has_block;
      const is_source_file = has_block && idx === source_segments_count - 1;

      if (!node.children[seg]) {
        node.children[seg] = {
          name: seg,
          path: is_block_leaf ? item_key : running,
          // For blocks we store an empty *array* so AVA can assert `children.length === 0`
          children: is_block_leaf ? [] : {},
          selected: false,
          is_file: is_block_leaf || is_source_file || (is_last && seg.includes('.')),
        };
      }

      node = node.children[seg];
      if (is_last) {
        node.selected = true;
        node.exists = exists;
      }
    });
  }

  return root;
}

/**
 * tree_to_html
 * Recursively convert a tree node into <ul>/<li> HTML.
 * Selected nodes receive a remove button.
 *
 * @param {Object} node
 * @param {Set<string>} selected_paths – quick lookup for removal buttons
 * @returns {string}
 */
export function tree_to_html(node, selected_paths) {
  if (!node.children || !Object.keys(node.children).length) return '';

  const child_html = Object.values(node.children)
    .sort((a, b) => {
      if (a.is_file !== b.is_file) return a.is_file ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .map(child => build_tree_item(child, selected_paths, tree_to_html(child, selected_paths)))
    .join('');

  return `<ul>${child_html}</ul>`;
}
