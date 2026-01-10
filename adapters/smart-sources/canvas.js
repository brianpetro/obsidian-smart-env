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
 * Build a link record compatible with SmartSource outlinks.
 * @param {Object} params
 * @param {string} params.target
 * @param {string} [params.title]
 * @returns {{ title: string, target: string, line: number }}
 */
function build_link_record({ target, title } = {}) {
  if (!target) return null;
  return {
    title: title || target,
    target,
    line: 1,
  };
}

/**
 * Extract link records from a single canvas node.
 * @param {Object} params
 * @param {Object} params.node
 * @returns {Array<{ title: string, target: string, line: number, embedded?: boolean }>}
 */
function get_canvas_node_links({ node } = {}) {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'text' && typeof node.text === 'string') {
    return get_markdown_links(node.text);
  }
  if (node.type === 'file' && typeof node.file === 'string') {
    const subpath = typeof node.subpath === 'string' ? node.subpath : '';
    const target = `${node.file}${subpath}`;
    const record = build_link_record({ target, title: node.file });
    return record ? [record] : [];
  }
  if (node.type === 'link' && typeof node.url === 'string') {
    const record = build_link_record({ target: node.url, title: node.url });
    return record ? [record] : [];
  }
  return [];
}

/**
 * Extract link records from canvas nodes.
 * @param {Object} params
 * @param {Array<Object>} [params.nodes=[]]
 * @returns {Array<{ title: string, target: string, line: number, embedded?: boolean }>}
 */
function get_canvas_links_from_nodes({ nodes = [] } = {}) {
  if (!Array.isArray(nodes)) return [];
  return nodes.reduce((links, node) => {
    links.push(...get_canvas_node_links({ node }));
    return links;
  }, []);
}

/**
 * Parse `.canvas` JSON content and return outlink records.
 * @param {Object} params
 * @param {string} params.content
 * @returns {Array<{ title: string, target: string, line: number, embedded?: boolean }>}
 */
export function get_canvas_links({ content } = {}) {
  const canvas_data = parse_canvas_json({ content });
  if (!canvas_data?.nodes) return [];
  return get_canvas_links_from_nodes({ nodes: canvas_data.nodes });
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

    this.data.outlinks = get_canvas_links({ content });

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
