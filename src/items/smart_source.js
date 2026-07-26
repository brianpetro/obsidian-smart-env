import { SmartSource as BaseSmartSource } from 'smart-sources/smart_source.js';
import { DEFAULT_EMBEDDING_TYPE } from '../utils/embedding_item.js';

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
    this._block_coverage_cache = null;
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

