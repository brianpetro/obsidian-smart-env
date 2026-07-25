/**
 * Open Smart Plugins browser.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @param {object} [params={}]
 * @param {string} [params.event_source]
 * @returns {boolean}
 */
export function env_browse_smart_plugins(params = {}) {
  this?.events?.emit?.('smart_plugins:browse', {
    event_source: params.event_source,
  });
  return true;
}

export const commands = {
  'browse-smart-plugins': {
    name: 'Browse Smart Plugins',

    register_when({ plugin, env }) {
      return plugin === env.main;
    },
  },
};

export const menus = {
  'env:status_bar_menu': {
    title: 'Browse Smart Plugins',
    icon: 'package',
    order: 60,
  },
};
