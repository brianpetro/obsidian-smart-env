import { FileSourceContentAdapter } from "smart-sources/adapters/_file.js";
import { get_bases_file_links } from "smart-sources/utils/get_bases_cache_links.js";
/**
 * @class BasesSourceContentAdapter
 * @extends FileSourceContentAdapter
 * @description
 * Adapter for handling a SmartSource that is backed by a Markdown file.
 * Responsible for importing file content into `item.data.blocks`, computing hashes, and identifying outlinks.
 */
export class BasesSourceContentAdapter extends FileSourceContentAdapter {
  static extensions = ['base'];
  async import() {
    if (!this.item?.file) return;
    const base_links = get_bases_file_links({ source: this.item });
    this.data.outlinks = base_links;
    this.data.blocks = this.data.blocks || {};
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
  collection: null, // No collection adapter needed for markdown sources
  item: BasesSourceContentAdapter
};
