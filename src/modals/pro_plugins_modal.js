import { Modal } from 'obsidian';

export class ProPluginsModal extends Modal {
  constructor(app, env) {
    super(app);
    this.env = env;
  }

  async onOpen() {
    if (this.modalEl?.classList) {
      this.modalEl.classList.add('smart-env-pro-plugins-modal');
    }

    if (this.modalEl?.style) {
      this.modalEl.style.width = 'min(920px, 92vw)';
      this.modalEl.style.maxHeight = 'min(820px, 88vh)';
    }

    this.titleEl.setText('Smart Plugins');
    this.contentEl.empty();

    const plugin_store = await this.env.smart_components.render_component('pro_plugins_list', this.env, {
      event_source: 'pro_plugins_modal',
    });
    if (plugin_store) {
      this.contentEl.appendChild(plugin_store);
    }
  }

  onClose() {
    this.contentEl.empty();

    if (this.modalEl?.classList) {
      this.modalEl.classList.remove('smart-env-pro-plugins-modal');
    }

    if (this.modalEl?.style) {
      this.modalEl.style.width = '';
      this.modalEl.style.maxHeight = '';
    }
  }
}
