import { Modal } from 'obsidian';

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

class EnvStatsModal extends Modal {
  constructor(app, env) {
    super(app);
    this.env = env;
  }

  onOpen() {
    this.titleEl.setText('Smart Environment stats');
    this.modalEl?.classList?.add('smart-env-stats-modal');
    this.render();
  }

  onClose() {
    this.modalEl?.classList?.remove('smart-env-stats-modal');
    this.contentEl.empty();
  }

  async render() {
    this.contentEl.empty();
    const loading_el = this.contentEl.createEl('p', {
      cls: 'smart-env-stats-modal__loading',
      text: 'Opening stats...',
    });
    loading_el.setAttribute('aria-live', 'polite');

    try {
      const component = await this.env.smart_components.render_component(
        'env_stats',
        this.env,
      );
      this.contentEl.empty();
      if (component) {
        this.contentEl.appendChild(component);
        return;
      }
      this.contentEl.createEl('p', { text: 'Failed to load stats.' });
    } catch (error) {
      console.error('[env_stats] Failed to render stats modal', error);
      this.contentEl.empty();
      this.contentEl.createEl('p', {
        text: 'Failed to load stats. See the developer console for details.',
      });
    }
  }
}
