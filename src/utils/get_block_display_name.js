/**
 * @deprecated 2026-03-27: move to action-getter-architecture (block_get_display_name)
 */
export function get_block_display_name(item, settings = {}) {
  if (!item?.key) return '';
  const show_full_path = settings.show_full_path ?? true;
  if (show_full_path) {
    return item.key.replace(/#/g, ' > ').replace(/\//g, ' > ');
  }
  const pcs = [];
  const [source_key, ...block_parts] = item.key.split('#');
  const filename = source_key.split('/').pop();
  pcs.push(filename);
  if (block_parts.length) {
    const last = block_parts[block_parts.length - 1];
    if (last.startsWith('{') && last.endsWith('}')) {
      block_parts.pop();
      pcs.push(block_parts.pop());
      if (item.lines) pcs.push(`Lines: ${item.lines.join('-')}`);
    } else {
      pcs.push(block_parts.pop());
    }
  }
  return pcs.filter(Boolean).join(' > ');
}
