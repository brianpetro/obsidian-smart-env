import base from 'smart-blocks';
import { SmartBlock } from '../items/smart_block.js';
import { SmartBlocks } from 'smart-blocks/smart_blocks.js';
import { AjsonMultiFileBlocksDataAdapter } from "smart-blocks/adapters/data/ajson_multi_file.js";
import { MarkdownBlockContentAdapter } from "smart-blocks/adapters/markdown_block.js";

base.class = SmartBlocks;
base.version = SmartBlocks.version;
base.item_type = SmartBlock;
base.data_adapter = AjsonMultiFileBlocksDataAdapter;
base.block_adapters = {
  "md": MarkdownBlockContentAdapter,
  "txt": MarkdownBlockContentAdapter,
  "excalidraw.md": MarkdownBlockContentAdapter,
  // "canvas": MarkdownBlockContentAdapter,
};

export { SmartBlocks };
export default base;