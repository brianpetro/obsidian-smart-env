/**
 * Remove the current context item from its owning Smart Context.
 *
 * Builder UIs may pass on_remove/on_remove_disabled so grouped or inherited
 * items keep the same behavior as the inline remove control.
 *
 * @this {import('smart-contexts').ContextItem}
 * @param {object} [params={}]
 * @param {Function} [params.on_remove]
 * @param {Function} [params.on_remove_disabled]
 * @param {boolean} [params.remove_disabled]
 * @returns {Promise<boolean>}
 */
export async function context_item_remove(params = {}) {
  const click_event = params.click_event || params.event || null;

  if (params.remove_disabled === true) {
    if (typeof params.on_remove_disabled === 'function') {
      await params.on_remove_disabled(click_event, this);
    }
    return false;
  }

  if (typeof params.on_remove === 'function') {
    await params.on_remove(click_event, this);
    return true;
  }

  const smart_context = this?.collection?.smart_context
    || params.smart_context
    || params.ctx
  ;
  if (typeof smart_context?.remove_item !== 'function') return false;

  smart_context.remove_item(this.key);
  return true;
}

export const menus = {
  'context_item:action_menu': {
    title: 'Remove from context',
    icon: 'x',
    order: 90,
    disabled() {
      return this.params.remove_disabled === true;
    },
  },
};
