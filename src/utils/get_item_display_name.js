export const DISPLAY_SEPARATOR = ' › ';

/**
 * @deprecated 2026-03-27: move to action-getter-architecture (item_get_display_name)
 * may call block_get_display_name or source_get_display_name actions if applicable/available
 * Builds the display name for a connection item.
 * @param {import('smart-collections').CollectionItem} item
 * @param {object} settings
 * @returns {string}
 */
export function get_item_display_name(item, settings = {}) {
  if (!item?.key) return '';
  const show_full_path = settings.show_full_path ?? true;
  if(show_full_path) {
    return item.key.replace(/#/g, DISPLAY_SEPARATOR).replace(/\//g, DISPLAY_SEPARATOR);
  }
  const pcs = [];
  const [source_key, ...block_parts] = item.key.split('#');
  const filename = source_key.split('/').pop();
  pcs.push(filename);
  if (block_parts.length) {
    pcs.push(block_parts.pop());
  }
  return pcs.join(DISPLAY_SEPARATOR);
}
