/**
 * Open the current context item.
 *
 * @this {import('smart-contexts').ContextItem}
 * @param {object} [params={}]
 * @returns {Promise<boolean>}
 */
export async function context_item_open(params = {}) {
  if (typeof this?.open !== 'function') return false;
  await this.open(params.click_event || params.event || null);
  return true;
}

export const menus = {
  'context_item:action_menu': {
    title: 'Open item',
    icon: 'external-link',
    order: 10,
    disabled() {
      return typeof this.scope?.open !== 'function';
    },
  },
};
