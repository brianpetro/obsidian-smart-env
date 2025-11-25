/**
 * @module excluded_sources_modal
 * @description A modal listing all sources that are excluded based on user settings
 */

import { Modal } from 'obsidian';

/**
 * @class ExcludedSourcesModal
 */
export class ExcludedSourcesModal extends Modal {
  /**
   * @param {Object} app - Obsidian app
   * @param {Object} env - The environment instance
   */
  constructor(app, env) {
    super(app);
    this.env = env;
  }

  async onOpen() {
    this.titleEl.setText('Excluded Sources');

    this.contentEl.addClass('excluded-sources-modal');
    this.render_excluded_list();
  }

  async render_excluded_list() {
    this.contentEl.empty();
    const list_el = this.contentEl.createEl('ul');
    const excluded_file_paths = this.env.smart_sources.excluded_file_paths;
    for (const file_path of excluded_file_paths) {
      const li = list_el.createEl('li');
      li.setText(file_path);
    }
  }
}
