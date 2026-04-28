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
  const root = create_tree_node();
  const selected_folders = selected_items
    .map(get_item_key)
    .filter((item_key) => item_key && is_folder_item_key(item_key))
  ;

  for (const item of selected_items) {
    const item_key = get_item_key(item);
    if (!item_key) continue;
    if (is_redundant_path(item_key, selected_folders)) continue;

    insert_item_path(root, {
      item_key,
      exists: item?.exists,
    });
  }

  return root;
}

/**
 * @param {import('smart-contexts').ContextItem|{ key?: string, path?: string }} item
 * @returns {string}
 */
function get_item_key(item) {
  return item?.key || item?.path || '';
}

/**
 * @returns {{ name: string, children: Record<string, object>, selected: boolean }}
 */
function create_tree_node() {
  return { name: '', children: {}, selected: false };
}

/**
 * @param {string} item_key
 * @param {string[]} selected_folders
 * @returns {boolean}
 */
function is_redundant_path(item_key, selected_folders) {
  return selected_folders.some((folder_key) => {
    if (folder_key === item_key) return false;
    return item_key.startsWith(`${folder_key}/`);
  });
}

/**
 * @param {string} item_key
 * @returns {boolean}
 */
function is_folder_item_key(item_key) {
  const block_idx = find_first_block_separator(item_key);
  const source_path = block_idx === -1 ? item_key : item_key.slice(0, block_idx);
  return !source_path.match(/\.[a-zA-Z0-9]+$/u);
}

/**
 * @param {string} value
 * @returns {number}
 */
function find_first_block_separator(value = '') {
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
}

/**
 * @param {string} source_path
 * @returns {string[]}
 */
function split_source_path_segments(source_path = '') {
  const segments = [];
  let segment = '';
  let in_wikilink = false;

  for (let i = 0; i < source_path.length; i++) {
    if (!in_wikilink && source_path.slice(i, i + 2) === '[[') {
      in_wikilink = true;
      segment += '[[';
      i++;
      continue;
    }

    if (in_wikilink && source_path.slice(i, i + 2) === ']]') {
      in_wikilink = false;
      segment += ']]';
      i++;
      continue;
    }

    if (!in_wikilink && source_path[i] === '/') {
      if (segment) segments.push(segment);
      segment = '';
      continue;
    }

    segment += source_path[i];
  }

  if (segment) segments.push(segment);
  return segments;
}

/**
 * @param {string} block_path
 * @returns {string[]}
 */
function split_block_path_segments(block_path = '') {
  const segments = [];
  let segment = '';
  let in_wikilink = false;

  for (let i = 0; i < block_path.length; i++) {
    if (!in_wikilink && block_path.slice(i, i + 2) === '[[') {
      in_wikilink = true;
      segment += '[[';
      i++;
      continue;
    }

    if (in_wikilink && block_path.slice(i, i + 2) === ']]') {
      in_wikilink = false;
      segment += ']]';
      i++;
      continue;
    }

    if (!in_wikilink && block_path[i] === '#') {
      if (segment) {
        segments.push(segment);
        segment = '';
      }

      if (block_path[i + 1] === '#') {
        segment = '#';
        while (block_path[i + 1] === '#') {
          i++;
          segment += '#';
        }
      } else if (block_path[i + 1] === '{') {
        segment = '#';
      }
      continue;
    }

    segment += block_path[i];
  }

  if (segment) segments.push(segment);
  return segments;
}

/**
 * Expand an item path into tree segments, preserving wikilinks and block refs.
 *
 * @param {string} item_path
 * @returns {{ segments:string[], has_block:boolean, source_segments_count:number }}
 */
function split_path_segments(item_path) {
  const block_idx = find_first_block_separator(item_path);
  const has_block = block_idx !== -1;
  const source_path = has_block ? item_path.slice(0, block_idx) : item_path;
  const block_path = has_block ? item_path.slice(block_idx) : '';
  const source_segments = split_source_path_segments(source_path);
  const segments = [...source_segments];

  if (block_path) {
    segments.push(...split_block_path_segments(block_path));
  }

  return {
    segments,
    has_block,
    source_segments_count: source_segments.length,
  };
}

/**
 * @param {ReturnType<typeof create_tree_node>} root
 * @param {object} params
 * @param {string} params.item_key
 * @param {boolean|null|undefined} params.exists
 * @returns {void}
 */
function insert_item_path(root, params = {}) {
  const { item_key, exists } = params;
  const { segments, has_block, source_segments_count } = split_path_segments(item_key);

  let node = root;
  let running = '';

  segments.forEach((segment, index) => {
    running = get_running_path(running, segment, {
      has_block,
      index,
      source_segments_count,
    });

    // Keep external prefixes in path metadata, but hide them from the rendered root.
    if (segment.startsWith('external:..')) return;

    const is_last = index === segments.length - 1;
    const is_block_leaf = is_last && has_block;
    const is_source_file = has_block && index === source_segments_count - 1;

    if (!node.children[segment]) {
      node.children[segment] = {
        name: segment,
        path: is_block_leaf ? item_key : running,
        // For blocks we store an empty *array* so AVA can assert `children.length === 0`.
        children: is_block_leaf ? [] : {},
        selected: false,
        is_file: is_block_leaf || is_source_file || (is_last && segment.includes('.')),
      };
    }

    node = node.children[segment];
    if (is_last) {
      node.selected = true;
      node.exists = exists;
    }
  });
}

/**
 * @param {string} running
 * @param {string} segment
 * @param {object} params
 * @param {boolean} params.has_block
 * @param {number} params.index
 * @param {number} params.source_segments_count
 * @returns {string}
 */
function get_running_path(running, segment, params = {}) {
  if (!running) return segment;
  if (!params.has_block || params.index < params.source_segments_count) {
    return `${running}/${segment}`;
  }
  return segment.startsWith('#')
    ? `${running}${segment}`
    : `${running}#${segment}`
  ;
}
