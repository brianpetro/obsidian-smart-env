import { SmartSources as BaseSmartSources } from 'smart-sources/smart_sources.js';
import { SmartSource } from '../items/smart_source.js';
import { Embeddings } from '../modules/embeddings.js';
import { AjsonShardedSourcesDataAdapter } from '../adapters/data/ajson_sharded_sources.js';

export class SmartSources extends BaseSmartSources {
  static version = 2;

  constructor(env, opts = {}) {
    super(env, opts);
    this.embeddings = env.embeddings?.for_collection?.(this) || new Embeddings(this);
    this.entities_vector_adapter = this.embeddings.entities_vector_adapter;
  }

  get data_dir() {
    return 'smart_sources';
  }

  get embed_queue() {
    if (this._embed_queue_ready) return this._embed_queue || [];

    const embed_queue = [];
    const embed_blocks = this.block_collection?.settings?.embed_blocks;
    const source_file_info = this.embeddings?.get_active_file_info?.();
    const block_file_info = this.block_collection?.embeddings?.get_active_file_info?.();

    for (const source of Object.values(this.items || {})) {
      const source_has_vector = this.embeddings?.has_current_vector_ref?.(source, undefined, source_file_info) === true;
      if (source._queue_embed || (!source_has_vector && source.should_embed)) {
        embed_queue.push(source);
      }

      if (!embed_blocks) continue;
      const blocks = source.blocks || [];
      for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        const block_has_vector = this.block_collection?.embeddings?.has_current_vector_ref?.(block, undefined, block_file_info) === true;
        if (block._queue_embed || (!block_has_vector && block.should_embed)) {
          embed_queue.push(block);
        }
      }
    }

    this._embed_queue = embed_queue;
    this._embed_queue_ready = true;
    return this._embed_queue;
  }

  mark_embed_queue_dirty() {
    this._embed_queue_ready = false;
    this._embed_queue = [];
  }

  handle_source_renamed(event = {}) {
    if (!this.should_handle_event(event)) return;

    const new_key = this.get_event_path(event);
    const old_key = event.old_path || event.from;
    if (!new_key && !old_key) return;

    if (old_key && old_key !== new_key && this.should_track_runtime_source_key(old_key)) {
      this.queue_deleted_source_tombstone(old_key);
      this.remove_source_runtime_state(old_key);
    }

    if (!new_key || !this.should_track_runtime_source_key(new_key)) return;

    let source = this.get(new_key);
    if (!source) source = this.init_file_path(new_key);
    if (!source) return;

    this.queue_source_re_import(source, { event_source: event.event_source });
  }

  handle_source_deleted(event = {}) {
    if (!this.should_handle_event(event)) return;

    const key = this.get_event_path(event);
    if (!key || !this.should_track_runtime_source_key(key)) return;

    this.queue_deleted_source_tombstone(key);
    this.remove_source_runtime_state(key);
  }

  should_track_runtime_source_key(source_key = '') {
    if (!source_key) return false;
    if (this.items?.[source_key]) return true;
    if (this.fs?.is_excluded?.(source_key)) return false;
    return Boolean(this.get_extension_for_path(source_key));
  }

  queue_deleted_source_tombstone(source_key = '') {
    if (!source_key) return;

    const source = this.get(source_key);
    if (source) {
      source.deleted = true;
      source._queue_save = false;
    }
    if (typeof this.data_adapter?.append_sources !== 'function') return;

    const deleted_source = source || {
      key: source_key,
      collection_key: this.collection_key,
      deleted: true,
    };

    this._deleted_source_tombstone_promise = this.data_adapter.append_sources([deleted_source])
      .catch((error) => {
        console.warn('[smart_env] Failed to append deleted source tombstone', {
          source_key,
          error,
        });
      })
    ;
  }

  remove_source_runtime_state(source_key = '') {
    if (!source_key) return;

    if (this.sources_re_import_queue?.[source_key]) {
      delete this.sources_re_import_queue[source_key];
    }

    remove_file_from_fs_cache(this.fs, source_key);
    remove_file_from_fs_cache(this.env?.fs, source_key);
    remove_source_and_blocks_from_items(this, source_key);

    this.mark_embed_queue_dirty();
    this.block_collection?.mark_embed_queue_dirty?.();
  }

  async process_load_queue() {
    await this.data_adapter.process_load_queue();
    if (this.block_collection) {
      this.block_collection.loaded = Object.keys(this.block_collection.items || {}).length;
    }
    const links_before_import = this.links;
    if (!this.opts.prevent_import_on_load) {
      await this.process_source_import_queue(this.opts);
    }
    if (this.links === links_before_import) this.build_links_map();
  }
}

function remove_source_and_blocks_from_items(source_collection, source_key = '') {
  if (!source_collection?.items || !source_key) return;

  const block_collection = source_collection.block_collection;
  const block_prefix = `${source_key}#`;

  Object.keys(block_collection?.items || {}).forEach((block_key) => {
    if (block_key === source_key || block_key.startsWith(block_prefix)) {
      delete block_collection.items[block_key];
    }
  });

  delete source_collection.items[source_key];
}

function remove_file_from_fs_cache(fs, file_path = '') {
  if (!fs || !file_path) return;

  if (fs.files) delete fs.files[file_path];
  if (Array.isArray(fs.file_paths)) {
    fs.file_paths = fs.file_paths.filter((path) => path !== file_path);
  }
}

export default {
  class: SmartSources,
  version: SmartSources.version,
  item_type: SmartSource,
  data_adapter: AjsonShardedSourcesDataAdapter,
  collection_key: 'smart_sources',
  process_embed_queue: true,
  load_order: 100,
};
