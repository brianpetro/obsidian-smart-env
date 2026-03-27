import { SmartBlock } from '../items/smart_block.js';
import { SmartBlocks } from 'smart-blocks/smart_blocks.js';
import { AjsonMultiFileBlocksDataAdapter } from "smart-blocks/adapters/data/ajson_multi_file.js";
import { MarkdownBlockContentAdapter } from "smart-blocks/adapters/markdown_block.js";

export { SmartBlocks };
export default {
  class: SmartBlocks,
  version: SmartBlocks.version,
  item_type: SmartBlock,
  data_adapter: AjsonMultiFileBlocksDataAdapter,
  collection_key: 'smart_blocks',
  block_adapters: {
    "md": MarkdownBlockContentAdapter,
    "txt": MarkdownBlockContentAdapter,
    "excalidraw.md": MarkdownBlockContentAdapter,
    // "canvas": MarkdownBlockContentAdapter,
  },
};