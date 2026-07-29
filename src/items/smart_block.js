import { SmartBlock as BaseSmartBlock } from 'smart-blocks/smart_block.js';
import { DEFAULT_EMBEDDING_TYPE } from '../utils/embedding_item.js';
import { get_block_display_name } from '../utils/get_block_display_name.js';

export class SmartBlock extends BaseSmartBlock {
  static version = 2;

  merge_defaults() {
    this._pending_data = create_empty_block_data();
    this._embed_input = '';
  }

  init() {
    if (!this.settings.embed_blocks) return;
    if (this.is_unembedded) this.queue_embed();
  }

  /**
   * @param {Object} params - Parameters for display settings
   * @param {boolean} params.show_full_path
   */
  get_display_name(params = {}) {
    // 2026-03-27: this settings object is probably wrong, needs eval
    // likely merge/spread of possible settings targets (or decided to focus on params arg)
    const display_settings = {
      ...(this.env?.settings?.smart_view_filter || {}), // DEPRECATED? settings scope
      ...params
    };
    return get_block_display_name(this, display_settings);
  }

  // DEPRECATED
  /**
   * @deprecated avoid view-logic in Collection/Item AND prefix display_ where used anyway
   */
  get name() {
    return this.get_display_name();
  }

  queue_embed() {
    const should_queue = this.should_embed;
    if (Boolean(this._queue_embed) !== Boolean(should_queue)) {
      this.collection?.mark_embed_queue_dirty?.();
      this.source_collection?.mark_embed_queue_dirty?.();
    }
    this._queue_embed = should_queue;
  }

  queue_save() {
    if (this.collection?._defer_embed_saves) {
      this._queue_save = true;
      return;
    }

    const source = this.source;
    const sub_key = this.sub_key;
    const block_key = this._block_key || this._pending_data?.key || (source && sub_key ? `${source.key}${sub_key}` : '');

    if (!source || !sub_key) {
      this._queue_save = false;
      return;
    }

    if (this.deleted) {
      remove_source_block_data(source, sub_key);
      if (block_key) delete this.collection.items[block_key];
    } else if (source_has_block(source, sub_key)) {
      // Block data is already attached to the source-owned blocks_data record.
    } else if (this._pending_data) {
      this.data = this._pending_data;
    } else {
      if (block_key) delete this.collection.items[block_key];
      this._queue_save = false;
      return;
    }

    source.queue_save();
    this._queue_save = false;
  }

  async remove() {
    await this.block_adapter.remove();
    this.delete();
  }

  async move_to(to_key) {
    await this.block_adapter.move_to(to_key);
    this.delete();
  }

  get data() {
    const block_key = this._pending_data?.key || this._block_key || '';
    if (!block_key) {
      if (!this._pending_data) this._pending_data = create_empty_block_data();
      return this._pending_data;
    }

    set_block_refs(this, block_key);

    if (this.deleted) {
      if (!this._pending_data) {
        this._pending_data = {
          key: this._block_key || '',
        };
      }
      return this._pending_data;
    }

    const source = this.source;
    const sub_key = this.sub_key;
    if (!source || !sub_key) {
      if (!this._pending_data) this._pending_data = {};
      return this._pending_data;
    }

    const source_data = source.data;

    if (
      this._data_ref
      && this._data_source === source
      && this._data_sub_key === sub_key
      && this._data_source_data === source_data
      && source_data.blocks_data?.[sub_key] === this._data_ref
    ) {
      return this._data_ref;
    }

    const block_data = source_data.blocks_data?.[sub_key];
    if (!block_data) {
      if (!this._pending_data) {
        this._pending_data = {
          key: `${source.key}${sub_key}`,
        };
      }
      return this._pending_data;
    }

    this._pending_data = null;
    this._data_ref = block_data;
    this._data_source = source;
    this._data_sub_key = sub_key;
    this._data_source_data = source_data;
    return this._data_ref;
  }

  set data(data) {
    data = data || {};
    delete data.path;
    delete data.class_name;
    const block_key = data.key || this._block_key || '';
    if (!block_key) {
      this._pending_data = data;
      clear_block_data_cache(this);
      return;
    }

    set_block_refs(this, block_key);

    const sub_key = this._sub_key || '';
    if (!this._source_key || !sub_key) {
      this._pending_data = data;
      clear_block_data_cache(this);
      return;
    }

    const source = this.source;
    if (!source) {
      this._pending_data = data;
      clear_block_data_cache(this);
      return;
    }

    const source_data = source.data;
    if (!source_data.blocks_data) source_data.blocks_data = {};
    data.key = `${source.key}${sub_key}`;
    source_data.blocks_data[sub_key] = data;
    this._pending_data = null;
    this._data_ref = data;
    this._data_source = source;
    this._data_sub_key = sub_key;
    this._data_source_data = source_data;

    source.data.block_embedding_selection = null;
  }

  get source_key() {
    set_block_refs(this, this._pending_data?.key || this._block_key || '');
    return this._source_key || '';
  }

  get sub_key() {
    set_block_refs(this, this._pending_data?.key || this._block_key || '');
    return this._sub_key || '';
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

  get should_embed() {
    return this.get_should_embed();
  }

  get_should_embed(params = {}) {
    const source = params.source || this.source;
    const block_data = this.data;
    if (
      source?.data
      && (
        this._should_embed_cache === null
        || block_data.should_embed == null
      )
    ) {
      source.data.block_embedding_selection = null;
    }
    if (this._should_embed_cache === null) this._should_embed_cache = undefined;
    source?.ensure_block_embedding_selection?.({
      min_chars: params.min_chars,
    });
    return block_data.should_embed === true;
  }
}

function create_empty_block_data() {
  return {
    text: null,
    length: 0,
    last_read: {
      hash: null,
      at: 0,
    },
  };
}

function set_block_refs(block, block_key = '') {
  if (!block_key) return;
  if (block_key === block._block_key && block._source_key !== undefined) return;
  clear_block_data_cache(block);
  block._block_key = block_key;
  block._source_key = get_source_key_from_block_key(block_key);
  block._sub_key = get_sub_key_from_block_key(block_key);
}

function clear_block_data_cache(block) {
  block._data_ref = null;
  block._data_source = null;
  block._data_sub_key = '';
  block._data_source_data = null;
}

function get_source_key_from_block_key(block_key = '') {
  const value = String(block_key || '');
  const hash_i = value.indexOf('#');
  return hash_i === -1 ? value : value.slice(0, hash_i);
}

function get_sub_key_from_block_key(block_key = '') {
  const value = String(block_key || '');
  const hash_i = value.indexOf('#');
  return hash_i === -1 ? '' : value.slice(hash_i);
}

function source_has_block(source, sub_key) {
  if (!source || !sub_key) return false;
  return source.has_block(sub_key);
}

function remove_source_block_data(source, sub_key) {
  if (!source?.data || !sub_key) return;
  if (source.data.blocks_data) delete source.data.blocks_data[sub_key];
  source.data.block_embedding_selection = null;
}

