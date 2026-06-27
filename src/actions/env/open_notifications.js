/**
 * Open the notifications feed modal.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_open_notifications() {
  if (typeof this?.open_notifications_feed_modal !== 'function') return false;
  this.open_notifications_feed_modal();
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title: 'Notifications',
    icon: 'bell',
    order: 50,
  },
};
