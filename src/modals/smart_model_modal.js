import { Modal } from 'obsidian';

/**
 * @typedef {object} EditModelModalOpts
 * @property {object} model     SmartModel instance
 * @property {Function} [on_saved]
 */
export class SmartModelModal extends Modal {
  /**
   * @param {App} app
   * @param {EditModelModalOpts} opts
   */
  constructor(model, params = {}) {
    const app = model.env.plugin.app || window.app;
    super(app);
    this.model = model;
    this.collection = this.model.collection;
    this.env = this.model.env;
    this.params = params;
  }

  onOpen() {
    this.titleEl.setText('Edit model');
    this.contentEl.addClass('smart-model-modal');
    this.render_form();
  }

  onClose() {
    this.contentEl.empty();
    if(typeof this.params.on_close === 'function') {
      this.params.on_close();
    }
  }

  async render_form() {
    const container = this.contentEl;
    container.empty();
    const model = this.model;
    const model_actions_bar = await this.env.smart_components.render_component('settings_model_actions', model, {
      // these callbacks should probably be handled via events instead
      on_before_new: async () => { this.close() },
      on_after_delete: async () => { this.close() },
    });
    container.appendChild(model_actions_bar);

    const settings = model.settings_config;
    const form = await this.env.smart_view.render_settings(settings, {
      scope: model,
    });
    container.appendChild(form);
    const test_btn = container.createEl('button', { text: 'Test model' });
    const test_results_el = container.createDiv({ cls: 'model-test-container' });
    test_btn.addEventListener('click', async () => {
      await this.run_test(test_results_el, model);
    });
    if(this.params.test_on_open) {
      await this.run_test(test_results_el, model);
    }
  }

  async run_test(test_results_el, model) {
    test_results_el.empty();
    const test_result_el = test_results_el.createEl('pre', { cls: 'model-test-result', text: 'Testing...' });
    test_results_el.appendChild(test_result_el);
    const test_result = await model.test_model();
    test_result_el.textContent = JSON.stringify(test_result, null, 2);
  }
}