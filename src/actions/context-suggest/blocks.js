
export function context_suggest_blocks(params={}) {
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
    }))
  ;
}

function get_block_display_name(item, settings = {}) {
  if (!item?.key) return '';
  const show_full_path = settings.show_full_path ?? true;
  if(show_full_path) {
    return item.key.replace(/#/g, ' > ').replace(/\//g, ' > ');
  }
  const pcs = [];
  const [source_key, ...block_parts] = item.key.split('#');
  const filename = source_key.split('/').pop();
  pcs.push(filename);
  if (block_parts.length) {
    const last = block_parts[block_parts.length - 1];
    if(last.startsWith('{') && last.endsWith('}')) {
      block_parts.pop();
      pcs.push(block_parts.pop());
      if(item.lines) pcs.push(`Lines: ${item.lines.join('-')}`);
    }else{
      pcs.push(block_parts.pop());
    }
  }
  return pcs.filter(Boolean).join(' > ');
}
export const display_name = 'Add blocks';