/**
 * Copy the current Smart Context as plain text.
 *
 * This small wrapper keeps the menu item separate from the implementation
 * action so Pro can override `context_copy_to_clipboard` while this menu action
 * still resolves through the active context's natural action scope.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @returns {Promise<boolean>}
 */
export async function context_copy_text_to_clipboard(params = {}) {
  if (typeof this?.actions?.context_copy_to_clipboard !== 'function') return false;
  return await this.actions.context_copy_to_clipboard({
    ...params,
    with_media: false,
  });
}

export const menus = {
  'smart_context:copy_menu': {
    title: 'Copy text',
    icon: 'copy',
    order: 0,
    when() {
      return Number(this.scope?.item_count || 0) > 0;
    },
  },
};
