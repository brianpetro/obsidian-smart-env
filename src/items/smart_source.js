import { SmartSource as BaseSmartSource } from 'smart-sources/smart_source.js';
import { DEFAULT_EMBEDDING_TYPE } from '../utils/embedding_item.js';

const BLOCK_EMBEDDING_SELECTION_VERSION = 2;
const DEFAULT_MAX_TOKENS = 500;
const EMBEDDING_CHARS_PER_TOKEN = 3.7;

export class SmartSource extends BaseSmartSource {
  static version = 2;

  merge_defaults() {
    this.data = {
      class_name: 'SmartSource',
      last_read: {
        hash: null,
        mtime: 0,
      },
      embedding: {
        history: [],
      },
    };
    this._embed_input = null;
    this._queue_load = true;
  }

  init() {
    if (this.is_unembedded) this.queue_embed();
    if (!this.blocks_initialized) this.queue_import();
  }

  async import(params = {}) {
    if (this.data.block_embedding_selection?.requires_reimport === true) {
      params = { ...params, refresh: true };
    }
    return await super.import(params);
  }

  get blocks_initialized() { return Boolean(this.data.blocks_data); }

  get block_keys() { return Object.keys(this.data.blocks_data || {}); }

  has_block(sub_key) {
    return Object.prototype.hasOwnProperty.call(this.data.blocks_data || {}, sub_key);
  }

  get_block_lines(sub_key) { return this.data.blocks_data?.[sub_key]?.lines; }

  replace_blocks(blocks_by_sub_key = {}) {
    const current_blocks_data = this.data.blocks_data || {};
    const next_blocks_data = {};

    for (const sub_key in blocks_by_sub_key) {
      const block_data = current_blocks_data[sub_key] || {
        key: `${this.key}${sub_key}`,
      };
      block_data.key = `${this.key}${sub_key}`;
      block_data.lines = blocks_by_sub_key[sub_key];
      next_blocks_data[sub_key] = block_data;
    }

    this.data.blocks_data = next_blocks_data;
    this.data.block_embedding_selection = null;
  }

  ensure_block_embedding_selection(params = {}) {
    const blocks_data = this.data.blocks_data || {};
    const min_chars = params.min_chars ?? this.block_collection?.settings?.min_chars ?? 0;
    const max_tokens = params.max_tokens
      || this.env?.embedding_models?.default?.data?.max_tokens
      || DEFAULT_MAX_TOKENS
    ;
    const max_input_chars = Math.floor(max_tokens * EMBEDDING_CHARS_PER_TOKEN);
    const current_policy = this.data.block_embedding_selection;
    const policy_matches = (
      current_policy?.version === BLOCK_EMBEDDING_SELECTION_VERSION
      && current_policy.min_chars === min_chars
      && current_policy.max_input_chars === max_input_chars
      && current_policy.source_key === this.key
    );

    if (!params.force && policy_matches) {
      if (current_policy.requires_reimport === true) this.queue_import();
      return false;
    }

    const block_sub_keys = Object.keys(blocks_data);
    if (block_sub_keys.some((sub_key) => blocks_data[sub_key].size == null)) {
      this.queue_import();
      return false;
    }

    const nodes = [];
    let invalid_range = false;
    for (const sub_key of block_sub_keys) {
      const block_data = blocks_data[sub_key];
      const lines = block_data.lines;
      const line_start = lines?.[0];
      const line_end = lines?.[1];
      if (
        !Array.isArray(lines)
        || lines.length !== 2
        || !Number.isInteger(line_start)
        || !Number.isInteger(line_end)
        || line_start < 0
        || line_end < line_start
      ) {
        invalid_range = true;
        continue;
      }
      nodes.push({
        sub_key,
        lines,
        size: block_data.size,
        line_start,
        line_end,
        breadcrumbs_length: get_block_breadcrumbs_length(`${this.key}${sub_key}`),
        children: [],
      });
    }
    nodes.sort((a, b) => (
      a.line_start - b.line_start
      || b.line_end - a.line_end
      || a.sub_key.length - b.sub_key.length
    ));

    const roots = [];
    const stack = [];
    let overlap = null;
    for (const node of nodes) {
      while (stack.length) {
        const parent = stack[stack.length - 1];
        if (
          parent.line_start <= node.line_start
          && parent.line_end >= node.line_end
        ) {
          break;
        }
        if (!overlap && node.line_start <= parent.line_end) {
          overlap = { parent, node };
        }
        stack.pop();
      }

      if (stack.length) stack[stack.length - 1].children.push(node);
      else roots.push(node);
      stack.push(node);
    }

    const requires_reimport = invalid_range || Boolean(overlap);
    if (requires_reimport) this.queue_import();

    const selected_sub_keys = new Set();
    if (overlap) {
      console.warn('SmartSource: overlapping block ranges rejected', {
        source_key: this.key,
        previous: {
          sub_key: overlap.parent.sub_key,
          lines: overlap.parent.lines,
        },
        current: {
          sub_key: overlap.node.sub_key,
          lines: overlap.node.lines,
        },
      });
    } else {
      for (const root of roots) {
        const plan = select_block_embedding_plan(root, min_chars, max_input_chars);
        plan.selected_sub_keys.forEach((sub_key) => selected_sub_keys.add(sub_key));
      }
    }

    let selection_changed = false;
    for (const sub_key of block_sub_keys) {
      const block_data = blocks_data[sub_key];
      const should_embed = selected_sub_keys.has(sub_key);
      if (block_data.should_embed !== should_embed) selection_changed = true;
      block_data.should_embed = should_embed;

      if (!should_embed) {
        const block = this.block_collection?.get?.(`${this.key}${sub_key}`);
        if (block) {
          block._queue_embed = false;
          block.clear_staged_embed_content?.();
        }
      }
    }

    this.data.block_embedding_selection = {
      version: BLOCK_EMBEDDING_SELECTION_VERSION,
      min_chars,
      max_input_chars,
      source_key: this.key,
      requires_reimport,
    };

    if (selection_changed) {
      this.block_collection?.mark_embed_queue_dirty?.();
      const runtime = this.env?.smart_vec_index_runtime;
      runtime?.mark_collection_vec_index_dirty?.('smart_blocks');
      runtime?.schedule_collection_vec_index_rebuild?.('smart_blocks');
    }
    if (
      selection_changed
      || !policy_matches
      || current_policy?.requires_reimport !== requires_reimport
    ) this.queue_save();

    return selection_changed;
  }

  queue_embed() {
    const should_queue = this.should_embed;
    if (Boolean(this._queue_embed) !== Boolean(should_queue)) this.collection?.mark_embed_queue_dirty?.();
    this._queue_embed = should_queue;
  }

  get vec() {
    return this.collection.embeddings?.get_item_vector(this, DEFAULT_EMBEDDING_TYPE);
  }

  set vec(vec) {
    this.collection.embeddings?.set_item_vector(this, vec, DEFAULT_EMBEDDING_TYPE);
  }

  get last_embed() {
    return this.collection.embeddings?.get_item_embedding_ref(
      this,
      DEFAULT_EMBEDDING_TYPE,
    ) || {};
  }

  get embed_hash() {
    return this.last_embed.read_hash;
  }

  set embed_hash(hash) {
    if (this.data.embedding?.error) return;
    const embedding_ref = this.collection.embeddings?.get_item_embedding_ref(
      this,
      DEFAULT_EMBEDDING_TYPE,
    );
    if (!embedding_ref) return;
    embedding_ref.read_hash = hash;
  }

  get is_unembedded() {
    return !this.collection.embeddings?.has_current_vector_ref?.(this, DEFAULT_EMBEDDING_TYPE);
  }
}

function select_block_embedding_plan(node, min_chars, max_input_chars) {
  const content_capacity = Math.max(
    0,
    max_input_chars - node.breadcrumbs_length - 1,
  );
  const self_is_eligible = node.size >= min_chars;
  const self_loss = self_is_eligible
    ? Math.max(0, node.size - content_capacity)
    : Number.POSITIVE_INFINITY
  ;

  if (!node.children.length) {
    return self_is_eligible
      ? { selected_sub_keys: [node.sub_key], loss: self_loss }
      : { selected_sub_keys: [], loss: node.size }
    ;
  }

  const descendant_plan = {
    selected_sub_keys: [],
    loss: 0,
  };
  let child_size = 0;
  let child_line_count = 0;
  for (const child of node.children) {
    const child_plan = select_block_embedding_plan(child, min_chars, max_input_chars);
    descendant_plan.selected_sub_keys.push(...child_plan.selected_sub_keys);
    descendant_plan.loss += child_plan.loss;
    child_size += child.size;
    child_line_count += child.line_end - child.line_start + 1;
  }

  if (node.sub_key === '#') {
    const node_line_count = node.line_end - node.line_start + 1;
    const uncovered_line_count = node_line_count - child_line_count;
    const child_separator_count = node.children.length - 1;
    const uncovered_content_size = node.size
      - child_size
      - child_separator_count
      - uncovered_line_count
    ;
    descendant_plan.loss += Math.max(0, uncovered_content_size);
  }

  if (
    self_is_eligible
    && (
      !descendant_plan.selected_sub_keys.length
      || self_loss < descendant_plan.loss
    )
  ) {
    return {
      selected_sub_keys: [node.sub_key],
      loss: self_loss,
    };
  }

  return descendant_plan;
}

function get_block_breadcrumbs_length(block_key = '') {
  return block_key
    .split('/')
    .join(' > ')
    .split('#')
    .slice(0, -1)
    .join(' > ')
    .replace('.md', '')
    .length
  ;
}
