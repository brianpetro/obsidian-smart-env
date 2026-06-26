/**
 * Clear all active and excluded items from the current Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @returns {boolean}
 */
export function context_clear_context() {
  this.clear_all?.();
  return true;
}

export const menus = {
  'smart_context:actions_menu': {
    title: 'Clear this context',
    icon: 'rotate-ccw',
    order: 999,
    when() {
      return Number(this.scope?.item_count || 0) > 0
        || Number(this.scope?.excluded_item_count || 0) > 0
      ;
    },
  },
};
