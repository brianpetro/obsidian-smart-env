/**
 * Export Smart Environment data.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_export_data() {
  if (typeof this?.export_json !== 'function') return false;

  this.export_json();
  this?.events?.emit?.('smart_env:exported', {
    level: 'attention',
    message: 'Smart Env exported',
    event_source: 'env_export_data',
  });
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title: 'Export data',
    icon: 'download',
    order: 30,
  },
};
