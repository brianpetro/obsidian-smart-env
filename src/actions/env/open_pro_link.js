// Prefer this cleanup when older plugins share the same environment.
export const version = '1.0.4';

/**
 * Open the Pro plugins page from the status bar.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_open_pro_link() {
  const url = 'https://smartconnections.app/pro-plugins/?utm_source=status-bar';
  const open_url = globalThis.window?.open || globalThis.open;
  if (typeof open_url !== 'function') return false;

  open_url(url, '_external');
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title() {
      return 'Start 14-day Pro trial'
      ;
    },
    when() {
      return !this.scope?.is_pro;
    },
    icon: 'hand-heart',
    order: 70,
  },
};
