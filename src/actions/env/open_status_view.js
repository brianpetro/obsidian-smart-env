/**
 * Open the Smart Environment status view.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @param {object} [params={}]
 * @returns {boolean}
 */
export function env_open_status_view(params = {}) {
  if (typeof this?.open_env_status_view !== 'function') return false;

  this.open_env_status_view(params);
  return true;
}

export const commands = {
  'env-status-view': {
    name: 'Open Environment Status View',

    register_when({ plugin, env }) {
      return plugin === env.main;
    },
  },
};
