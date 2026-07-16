import { FileSourceContentAdapter } from "smart-sources/adapters/_file.js";
/**
 * @class RenderedSourceContentAdapter
 * @extends FileSourceContentAdapter
 * @description
 * Adapter for handling a SmartSource that is backed by a Rendered file.
 * Responsible for importing file content into `item.data.blocks`, computing hashes, and identifying outlinks.
 */
export class RenderedSourceContentAdapter extends FileSourceContentAdapter {
  static extensions = ['rendered'];
  static embed_input_action_key = 'source_get_embed_input_rendered';

  get embed_input_action_key() {
    return this.constructor.embed_input_action_key;
  }

  async import() {
    /* quietly skip import (for now) */
  }
}

export default {
  collection: null, // No collection adapter needed for markdown sources
  item: RenderedSourceContentAdapter
};
