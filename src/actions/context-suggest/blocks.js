import { get_block_display_name } from "../../utils/get_block_display_name.js";

export function context_suggest_blocks(params={}) {
  params?.modal?.setInstructions([
    { command: 'Enter', purpose: 'Add block to context' },
    { command: '←', purpose: 'Back to sources' },
  ]);
  let blocks = [];
  if(params.source_key) {
    const src = this.env.smart_sources.get(params.source_key);
    blocks = src.blocks;
  }else{
    blocks = Object.values(this.env.smart_blocks.items);
  }
  return blocks
    // sort by block.lines[0] ascending
    .sort((a, b) => {
      const a_line = Array.isArray(a.lines) && a.lines.length ? a.lines[0] : Infinity;
      const b_line = Array.isArray(b.lines) && b.lines.length ? b.lines[0] : Infinity;
      return a_line - b_line;
    })
    .map(block => ({
      key: block.key,
      display: get_block_display_name(block, { show_full_path: false }),
      select_action: () => {
        this.add_item(block.key);
      },
      arrow_left_action: ({modal}) => {
        modal.update_suggestions('context_suggest_sources');
      }
    }))
  ;
}

export const display_name = 'Add blocks';