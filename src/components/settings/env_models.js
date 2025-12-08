import { Menu, setIcon } from 'obsidian';
import { SmartModelModal } from '../../modals/smart_model_modal.js';
import { provider_options } from '../../utils/smart-models/provider_options.js';
import styles from './env_models.css';

function build_html (env, params) {
  return `<div class="model-settings">
    <div class="settings-group">Loading model options...</div>
  </div>`;
}
export async function render (env, params) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html(env, params));
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}
/**
 * @param params.only_show {string} - only show settings for this model collection key
 */
async function post_process (env, container, params) {
  const settings_group = container.querySelector('.settings-group');
  const render_model_type_settings = async (models_collection) => {
    let type_container;
    const existing_type_container = settings_group.querySelector(`[data-model-type="${models_collection.collection_key}"]`);
    if (existing_type_container) {
      type_container = existing_type_container;
      this.empty(type_container);
    } else {
      type_container = this.create_doc_fragment(`<div data-model-type="${models_collection.collection_key}"></div>`).firstElementChild;
      settings_group.appendChild(type_container);
    }
    // add heading
    const heading = this.create_doc_fragment(`<h2>${models_collection.model_type} models</h2>`).firstElementChild;
    type_container.appendChild(heading);
    // add settings
    const default_setting = await this.render_settings(models_collection.env_config.settings_config, {
      scope: models_collection,
    });
    type_container.appendChild(default_setting);
    type_container.querySelector('select').addEventListener('change', async (e) => {
      render_model_type_settings(models_collection);
    });
    const new_model_btn = type_container.querySelector('button');
    new_model_btn.addEventListener('click', async (e) => {
      const providers = (provider_options[models_collection.collection_key] || [])
        .map(p => ({ ...p, disabled: !models_collection.env_config.providers[p.value] }))
      ;
      if (providers.length === 0) {
        new_model_btn.disabled = true;
        return;
      }
      // render context Menu
      const menu = new Menu();
      providers.forEach(provider => {
        menu.addItem((item) => {
          item.setTitle(provider.label);
          if (provider.disabled) {
            item.setDisabled(true);
          }
          item.onClick(async () => {
            const model = models_collection.new_model({ provider_key: provider.value });
            const on_new_close = async () => {
              models_collection.settings.default_model_key = model.key;
              model.emit_event('model:changed');
              await render_model_type_settings(models_collection);
            }
            new SmartModelModal(model, { on_close: on_new_close }).open();
          });
        });
      });
      menu.showAtMouseEvent(e);
    });
    const info_container = this.create_doc_fragment(build_model_info_html(models_collection.default)).firstElementChild;
    type_container.appendChild(info_container);
    const icon_el = info_container.querySelector('.test-result-icon');
    setIcon(icon_el, get_test_result_icon_name(models_collection.default));
    const on_edit_close = async () => {
      await render_model_type_settings(models_collection);
    }
    info_container.querySelector('.open-model-modal').addEventListener('click', () => {
      new SmartModelModal(models_collection.default, { on_close: on_edit_close }).open();
    });
    info_container.querySelector('.test-model').addEventListener('click', () => {
      new SmartModelModal(models_collection.default, { on_close: on_edit_close, test_on_open: true }).open();
    });
  }
  const render_settings_group = async () => {
    this.empty(settings_group);
    if(params.only_show) {
      const collection = env[params.only_show];
      if(collection) {
        await render_model_type_settings(collection);
        return;
      } else {
        settings_group.innerText = 'No models found for the specified type: ' + params.only_show;
        return;
      }
    }
    const models_collections = [
      env.embedding_models,
      env.chat_completion_models,
      env.ranking_models,
    ].filter(Boolean);
    for (const collection of models_collections) {
      await render_model_type_settings(collection);
    }
  }
  await render_settings_group();
  return container;
}

function build_model_info_html (model) {
  const details = [
    `Provider: ${model.data.provider_key}`,
    `Model: ${model.data.model_key || '**MISSING - EDIT & SELECT MODEL**'}`,
  ];
  return `<div class="model-info">
    <div class="smart-env-settings-header">
      <b>Current: ${model.display_name} <span class="test-result-icon" data-icon="${get_test_result_icon_name(model)}"></span></b>
      <div>
        <button class="open-model-modal">Edit</button>
        <button class="test-model">Test</button>
      </div>
    </div>
    <pre>${details.join('\n')}</pre>
  </div>`;
}

function get_test_result_icon_name (model) {
  switch (model.data.test_passed) {
    case true:
      return 'square-check-big';
    case false:
      return 'circle-x';
    default:
      return 'square';
  }
}