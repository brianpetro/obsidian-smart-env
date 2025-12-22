import { Modal } from 'obsidian';

export class MilestonesModal extends Modal {
  constructor(app, env) {
    super(app);
    this.env = env;
  }

  async onOpen() {
    this.titleEl.setText('Smart Milestones');
    this.contentEl.empty();
    const milestones = await this.env.smart_components.render_component('milestones', this.env, {});
    this.contentEl.appendChild(milestones);
  }

  onClose() {
    this.contentEl.empty();
  }
}

