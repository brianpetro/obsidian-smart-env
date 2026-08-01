import { Modal, Notice } from 'obsidian';
import styles from './smart_model_modal.css';
import { render_settings_config } from '../utils/render_settings_config.js';

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
    this.env.smart_view.apply_style_sheet(styles);
    const form_container = container.createDiv({ cls: 'smart-model-settings-form' });
    render_settings_config(settings, model, form_container, {
      default_group_name: 'Model settings',
    });

    if (
      this.collection?.collection_key === 'embedding_models'
      && this.collection.default === model
    ) {
      const reindex_description = container.createEl('p', {
        text: 'Deletes the current model source and block embedding files, then re-imports sources and rebuilds embeddings. API providers may charge for the new embeddings.',
      });
      reindex_description.addClass('setting-item-description');
      const reindex_btn = container.createEl('button', { text: 'Re-index embeddings' });
      const reindex_result_el = container.createDiv({ cls: 'model-reindex-result' });
      reindex_btn.addEventListener('click', async () => {
        reindex_btn.disabled = true;
        reindex_btn.textContent = 'Re-indexing...';
        reindex_result_el.textContent = 'Removing current embeddings and rebuilding from source files...';

        try {
          const result = await this.env.smart_sources.reindex_embeddings();
          reindex_result_el.textContent = `Re-indexed embeddings from ${result.sources_queued} source${result.sources_queued === 1 ? '' : 's'}.`;
          new Notice('Embedding re-index completed.');
        } catch (error) {
          const message = error?.message || String(error || 'Embedding re-index failed.');
          console.warn('[smart_env] Failed to re-index embeddings', error);
          reindex_result_el.textContent = message;
          new Notice(message);
        } finally {
          reindex_btn.disabled = false;
          reindex_btn.textContent = 'Re-index embeddings';
        }
      });
    }

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
