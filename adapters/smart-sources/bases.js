import { FileSourceContentAdapter } from "smart-sources/adapters/_file.js";

/**
 * @class BasesSourceContentAdapter
 * @extends FileSourceContentAdapter
 * @description
 * Base adapter for an Obsidian Bases file. Rendered Bases views are handled by
 * the Pro adapter; this adapter only maintains the source import bookkeeping.
 */
export class BasesSourceContentAdapter extends FileSourceContentAdapter {
  static extensions = ['base'];
  static embed_input_action_key = 'source_get_embed_input_base';

  get embed_input_action_key() {
    return this.constructor.embed_input_action_key;
  }

  get should_embed() { return false; }

  static async init_items(collection) {
    await super.init_items(collection);

    Object.values(collection.items || {}).forEach(source => {
      if (source.file_type !== 'base') return;
      source._queue_embed = false;
      if (source.vec) source.vec = null;
    });
  }

  async import() {
    this.item._queue_embed = false;
    if (this.item.vec) this.item.vec = null;
    if (!this.item?.file) return;

    this.data.outlinks = [];
    this.data.metadata = this.data.metadata || {};

    const { mtime = 0, size = 0 } = this.item.file?.stat || {};
    this.data.last_import = {
      mtime,
      size,
      at: Date.now(),
      hash: this.data.last_read?.hash,
    };
    this.item.loaded_at = Date.now();
    this.item.queue_save?.();
  }
}

export default {
  collection: null,
  item: BasesSourceContentAdapter
};

