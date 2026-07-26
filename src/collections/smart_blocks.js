import { SmartBlocks as BaseSmartBlocks } from 'smart-blocks/smart_blocks.js';
import { MarkdownBlockContentAdapter } from 'smart-blocks/adapters/markdown_block.js';
import { SmartBlock } from '../items/smart_block.js';
import { Embeddings } from '../modules/embeddings.js';

export class SmartBlocks extends BaseSmartBlocks {
  static version = 2;

  constructor(env, opts = {}) {
    super(env, opts);
    this.embeddings = env.embeddings?.for_collection?.(this) || new Embeddings(this);
    this.entities_vector_adapter = this.embeddings.entities_vector_adapter;
  }

  get data_dir() {
    return 'smart_blocks';
  }

  get embed_queue() {
    if (this._embed_queue_ready) return this._embed_queue || [];

    const embed_queue = [];
    const file_info = this.embeddings?.get_active_file_info?.();

    for (const block of Object.values(this.items || {})) {
      const has_vector = this.embeddings?.has_current_vector_ref?.(block, undefined, file_info) === true;
      if (block._queue_embed || (!has_vector && block.should_embed)) {
        embed_queue.push(block);
      }
    }

    this._embed_queue = embed_queue;
    this._embed_queue_ready = true;
    return this._embed_queue;
  }

  mark_embed_queue_dirty() {
    this._embed_queue_ready = false;
    this._embed_queue = [];
    this.env.smart_sources?.mark_embed_queue_dirty?.();
  }

  async process_load_queue() {
    this.emit_event('collection:load_started');
    this.loaded = Object.keys(this.items || {}).length;
    this.emit_event('collection:load_completed', { loaded: this.loaded });
  }

  async process_save_queue() {
    if (this._defer_embed_saves) return;

    this.emit_event('collection:save_started');

    const save_queue = Object.values(this.items || {})
      .filter((block) => block._queue_save)
    ;

    save_queue.forEach((block) => block.queue_save());
    await this.env.smart_sources?.process_save_queue?.();

    this.emit_event('collection:save_completed', { saved: save_queue.length });
  }

  async process_embed_queue() {
    return await this.entities_vector_adapter.process_embed_queue();
  }
}

export default {
  class: SmartBlocks,
  version: SmartBlocks.version,
  item_type: SmartBlock,
  collection_key: 'smart_blocks',
  load_order: 110,
  block_adapters: {
    md: MarkdownBlockContentAdapter,
    txt: MarkdownBlockContentAdapter,
    'excalidraw.md': MarkdownBlockContentAdapter,
  },
};
