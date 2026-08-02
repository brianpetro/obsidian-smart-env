/**
 * Open the current context item when not attributed to a source or block
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
    title: 'Open external',
    icon: 'external-link',
    order: 10,
    when() {
      return !this.scope?.item_ref;
    },
    params(_menu_ctx, event) {
      return { event };
    },
    disabled() {
      return typeof this.scope?.open !== 'function';
    },
  },
};
