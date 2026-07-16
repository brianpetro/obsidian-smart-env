import { FileSourceContentAdapter } from "smart-sources/adapters/_file.js";
import { get_markdown_links } from "smart-sources/utils/get_markdown_links.js";

/**
 * Safely parse a JSON string.
 * @param {Object} params
 * @param {string} params.content
 * @returns {Object|null}
 */
export function parse_canvas_json({ content } = {}) {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (error) {
    console.warn('CanvasSourceContentAdapter: invalid JSON content.', error);
    return null;
  }
}
/**
 * @class CanvasSourceContentAdapter
 * @extends FileSourceContentAdapter
 * @description
 * Adapter for handling a SmartSource that is backed by a Markdown file.
 * Responsible for importing file content into `item.data.blocks`, computing hashes, and identifying outlinks.
 */
export class CanvasSourceContentAdapter extends FileSourceContentAdapter {
  static extensions = ['canvas'];
  static embed_input_action_key = 'source_get_embed_input_canvas';

  get embed_input_action_key() {
    return this.constructor.embed_input_action_key;
  }

  async import() {
    if (!this.item.file) {
      console.warn(`CanvasSourceContentAdapter: Skipping missing-file: ${this.file_path}`);
      return;
    }
    const content = await this.read();
    if (!content) return;
    if (this.data.last_import?.hash === this.data.last_read?.hash && Array.isArray(this.data.outlinks)) {
      return;
    }

    const canvas_data = parse_canvas_json({ content });
    const outlinks = [];
    if (Array.isArray(canvas_data?.nodes)) {
      const source_collection = this.item.collection;
      for (let i = 0; i < canvas_data.nodes.length; i++) {
        const node = canvas_data.nodes[i];
        if (!node || typeof node !== 'object') return [];
        if (node.type === 'text' && typeof node.text === 'string') {
          outlinks.push(...get_markdown_links(node.text));
        }
        if (node.type === 'file' && typeof node.file === 'string') {
          const source_key = node.file;
          const source = source_collection.get(source_key);
          if (source) {
            let key = source_key;
            // 2026-05-28: No block-level links for now because downstream porcesses doesn't yet handle them
            // ex. context/source follow-links-to-depth
            // const subpath = typeof node.subpath === 'string' ? node.subpath : '';
            // if (subpath) {
            //   const block_key = Object.keys(source.data.blocks).find((key) => key.endsWith(subpath));
            //   if (block_key) {
            //     key += block_key;
            //   }
            // }
            outlinks.push({
              title: key,
              target: key,
              line: 1,
              embedded: true,
            });
          }
        }
      }
    }
    this.data.outlinks = outlinks;

    const file_stat = this.item.file?.stat;
    const size = file_stat?.size ?? content.length;
    const mtime = file_stat?.mtime ?? 0;
    this.data.last_import = {
      mtime,
      size,
      at: Date.now(),
      hash: this.data.last_read?.hash,
    };
    this.item.loaded_at = Date.now();
    this.item.queue_save();
  }
}

export default {
  collection: null, // No collection adapter needed for markdown sources
  item: CanvasSourceContentAdapter
};

