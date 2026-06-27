/**
 * Open Smart Plugins browser.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_browse_smart_plugins() {
  this?.events?.emit?.('smart_plugins:browse', {
    event_source: 'status_bar',
  });
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title: 'Browse Smart Plugins',
    icon: 'package',
    order: 60,
  },
};
