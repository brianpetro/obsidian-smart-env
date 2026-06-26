import { copy_to_clipboard } from '../../utils/copy_to_clipboard.js';
import { context_to_md_tree } from '../../utils/smart-context/to_md_tree.js';

/**
 * Copy the current context as a markdown link tree.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @returns {Promise<boolean>}
 */
export async function context_copy_link_tree(params = {}) {
  const md_tree = context_to_md_tree(this).trim();
  if (!md_tree) {
    this.emit_event('context:copy_empty', {
      level: 'warning',
      message: 'No context items to copy.',
      event_source: 'smart_context.copy_link_tree',
    });
    return false;
  }

  const copied = await copy_to_clipboard(md_tree, {
    env: this.env,
    event_source: 'smart_context.copy_link_tree',
    success_event_key: 'context:clipboard_raw_copied',
    error_event_key: 'context:clipboard_raw_copy_failed',
    unavailable_event_key: 'context:clipboard_copy_unavailable',
  });
  if (!copied) return false;

  this.emit_event('context:link_tree_copied', {
    level: 'info',
    message: 'Copied link tree to clipboard.',
    event_source: 'smart_context.copy_link_tree',
  });
  return true;
}

export const menus = {
  'smart_context:copy_menu': {
    title: 'Copy link tree',
    icon: 'list-tree',
    order: 3,
    when() {
      return Number(this.scope?.item_count || 0) > 0;
    },
  },
};
