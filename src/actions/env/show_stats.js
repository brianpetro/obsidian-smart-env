import { EnvStatsModal } from '../../modals/env_stats.js';

/**
 * Open environment stats.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_show_stats() {
  const app = this.main?.app || this.obsidian_app;
  if (!app) return false;

  const modal = new EnvStatsModal(app, this);
  modal.open();
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title: 'Show stats',
    icon: 'chart-pie',
    order: 20,
  },
};
