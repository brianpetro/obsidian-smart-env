import { Modal } from 'obsidian';
import { merge_model_defaults_with_data } from '../utils/smart-models/merge_model_defaults_with_data.js';
import { Menu, setIcon } from 'obsidian';
import { provider_options } from '../utils/smart-models/provider_options.js';

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
    const new_btn = this.titleEl.createEl('button', { text: 'New' });
    new_btn.addEventListener('click', async (event) => {
      show_new_model_menu(this.collection, event, {
        on_before_new: async () => { this.close() },
      });
    });
    const container = this.contentEl;
    container.empty();
    const model = this.model;
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


export function show_new_model_menu(models_collection, event, params = {}) {
  const providers = (provider_options[models_collection.collection_key] || [])
    .map(p => ({ ...p, disabled: !models_collection.env_config.providers[p.value] }))
  ;
  if (providers.length === 0) {
    if (event.target.tagName.toLowerCase() === 'button') {
      event.target.disabled = true;
      event.title = 'No providers available to create new models.';
    }
  } else {
    // render context Menu
    const menu = new Menu();
    providers.forEach(provider => {
      menu.addItem((item) => {
        item.setTitle(provider.label);
        if (provider.disabled) {
          item.setDisabled(true);
        }
        item.onClick(async () => {
          if(typeof params.on_before_new === 'function') {
            await params.on_before_new();
          }
          const model = models_collection.new_model({ provider_key: provider.value });
          models_collection.settings.default_model_key = model.key;
          const on_new_close = async () => {
            // model.emit_event('model:changed');
          };
          new SmartModelModal(model, { on_close: on_new_close }).open();
        });
      });
    });
    menu.showAtMouseEvent(event);
  }
}