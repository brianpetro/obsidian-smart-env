import { normalize_context_item_data } from 'smart-contexts/context_items.js';

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
 * @param {Array<{ key?: string, path?: string, data?: object, exists?: boolean } & Object.<string, *>>} selected_items
 * @returns {Object} root tree node
 */
export function build_path_tree(selected_items = []) {
  const root = create_tree_node();
  const normalized_items = selected_items
    .map((item) => ({
      item,
      identity: get_item_identity(item),
    }))
    .filter(({ identity }) => identity.key)
  ;
  const selected_folders = normalized_items
    .filter(({ identity }) => identity.kind === 'folder')
    .map(({ identity }) => get_identity_path(identity))
  ;

  for (const { item, identity } of normalized_items) {
    if (is_redundant_path(get_identity_path(identity), selected_folders)) continue;

    insert_item_path(root, {
      identity,
      exists: item?.exists,
    });
  }

  return root;
}

/**
 * @param {{ key?: string, path?: string } & Object.<string, *>} item
 * @returns {string}
 */
function get_item_key(item) {
  return item?.key || item?.path || '';
}

/**
 * @param {{ key?: string, path?: string, data?: object } & Object.<string, *>} item
 * @returns {import('smart-types').ContextItemData & Object.<string, *>}
 */
function get_item_identity(item) {
  const item_key = get_item_key(item);
  const item_data = item?.data && typeof item.data === 'object'
    ? item.data
    : item
  ;
  return normalize_context_item_data(item_key, item_data);
}

/**
 * @returns {{ name: string, children: Record<string, object>, selected: boolean }}
 */
function create_tree_node() {
  return { name: '', children: Object.create(null), selected: false };
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
 * @param {import('smart-types').ContextItemData & Object.<string, *>} identity
 * @returns {string}
 */
function get_identity_path(identity) {
  const source_path = identity.source_path || identity.key || '';
  const scoped_path = identity.is_external === true
    ? `external:${source_path}`
    : source_path
  ;
  if (identity.kind !== 'block' || typeof identity.subpath !== 'string') {
    return scoped_path;
  }
  return `${scoped_path}#${identity.subpath}`;
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
      } else if (i === block_path.length - 1) {
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
 * @param {import('smart-types').ContextItemData & Object.<string, *>} identity
 * @returns {{ segments:string[], has_block:boolean, is_external:boolean, source_segments_count:number, hidden_source_segments_count:number }}
 */
function split_path_segments(identity) {
  const has_block = identity.kind === 'block' && typeof identity.subpath === 'string';
  const is_external = identity.is_external === true;
  const source_path = identity.source_path || identity.key || '';
  const block_path = has_block ? `#${identity.subpath}` : '';
  const source_segments = split_source_path_segments(source_path);
  const segments = [...source_segments];
  let hidden_source_segments_count = 0;

  if (is_external) {
    while (
      hidden_source_segments_count < source_segments.length
      && ['.', '..'].includes(source_segments[hidden_source_segments_count])
    ) {
      hidden_source_segments_count++;
    }
  }

  if (block_path) {
    segments.push(...split_block_path_segments(block_path));
  }

  return {
    segments,
    has_block,
    is_external,
    source_segments_count: source_segments.length,
    hidden_source_segments_count,
  };
}

/**
 * @param {ReturnType<typeof create_tree_node>} root
 * @param {object} params
 * @param {import('smart-types').ContextItemData & Object.<string, *>} params.identity
 * @param {boolean|null|undefined} params.exists
 * @returns {void}
 */
function insert_item_path(root, params) {
  const { identity, exists } = params;
  const item_key = identity.key;
  const {
    segments,
    has_block,
    is_external,
    source_segments_count,
    hidden_source_segments_count,
  } = split_path_segments(identity);

  /** @type {*} */
  let node = root;
  let running = is_external ? 'external:' : '';

  segments.forEach((segment, index) => {
    running = get_running_path(running, segment, {
      has_block,
      index,
      source_segments_count,
    });

    // Keep external traversal segments in path metadata, but hide them from the rendered root.
    if (index < hidden_source_segments_count) return;

    const is_last = index === segments.length - 1;
    const is_block_leaf = is_last && has_block;
    const is_source_file = has_block && index === source_segments_count - 1;
    const is_direct_file = is_last && identity.kind !== 'folder';
    const segment_kind = index >= source_segments_count
      ? 'block'
      : (index === source_segments_count - 1
        ? (has_block ? 'source' : identity.kind)
        : 'folder')
    ;

    if (!Object.prototype.hasOwnProperty.call(node.children, segment)) {
      node.children[segment] = {
        name: segment,
        path: is_last ? item_key : running,
        kind: segment_kind,
        children: Object.create(null),
        selected: false,
        is_file: is_block_leaf || is_source_file || is_direct_file,
      };
    }

    node = node.children[segment];
    if (is_last) {
      node.path = item_key;
      node.kind = identity.kind;
      node.selected = true;
      node.exists = exists;
      node.is_file = identity.kind !== 'folder';
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
function get_running_path(running, segment, params) {
  if (!running) return segment;
  if (running === 'external:') return `${running}${segment}`;
  if (!params.has_block || params.index < params.source_segments_count) {
    return `${running}/${segment}`;
  }
  return segment.startsWith('#')
    ? `${running}${segment}`
    : `${running}#${segment}`
  ;
}
