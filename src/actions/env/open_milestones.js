/**
 * Open the milestones modal.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_open_milestones() {
  if (typeof this?.open_milestones_modal !== 'function') return false;
  this.open_milestones_modal();
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title: 'Milestones',
    icon: 'flag',
    order: 40,
  },
};
