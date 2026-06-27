/**
 * Open the Pro referral or trial page from the status bar.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_open_pro_link() {
  const url = this?.is_pro
    ? 'https://smartconnections.app/my-referrals/?utm_source=status-bar'
    : 'https://smartconnections.app/pro-plugins/?utm_source=status-bar'
  ;
  const open_url = globalThis.window?.open || globalThis.open;
  if (typeof open_url !== 'function') return false;

  open_url(url, '_external');
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title() {
      return this.scope?.is_pro
        ? 'Refer a friend (Give 30, Get 30)'
        : 'Start 14-day Pro trial'
      ;
    },
    icon: 'hand-heart',
    order: 70,
  },
};
