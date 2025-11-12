import { Modal } from 'obsidian';

export class NotificationsFeedModal extends Modal {
  constructor(app, env) {
    super(app);
    this.env = env;
  }

  async onOpen() {
    this.titleEl.setText('Smart Env notifications');
    this.contentEl.empty();
    const container = await this.env.smart_components.render_component('notifications_feed', this.env);
    this.contentEl.appendChild(container);
  }

  onClose() {
    this.contentEl.empty();
  }
}
