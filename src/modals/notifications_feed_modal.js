import { Modal } from 'obsidian';

export class NotificationsFeedModal extends Modal {
  constructor(app, env) {
    super(app);
    this.env = env;
  }

  async onOpen() {
    if (this.modalEl?.classList) {
      this.modalEl.classList.add('smart-env-notifications-modal');
    }

    this.titleEl.setText('Smart Env notifications');

    this.contentEl.empty();
    const event_log = await this.env.smart_components.render_component('notifications_feed', this.env);
    this.contentEl.appendChild(event_log);
  }

  onClose() {
    this.contentEl.empty();

    if (this.modalEl?.classList) {
      this.modalEl.classList.remove('smart-env-notifications-modal');
    }
  }
}
