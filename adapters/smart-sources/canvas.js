import { FileSourceContentAdapter } from "smart-sources/adapters/_file.js";
/**
 * @class CanvasSourceContentAdapter
 * @extends FileSourceContentAdapter
 * @description
 * Adapter for handling a SmartSource that is backed by a Markdown file.
 * Responsible for importing file content into `item.data.blocks`, computing hashes, and identifying outlinks.
 */
export class CanvasSourceContentAdapter extends FileSourceContentAdapter {
  static extensions = ['canvas'];
  async import() {
    /* quietly skip import (for now) */
  }
}

export default {
  collection: null, // No collection adapter needed for markdown sources
  item: CanvasSourceContentAdapter
};