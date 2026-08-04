import { show_new_model_menu } from '../../utils/smart-models/show_new_model_menu.js';
import { render_settings_group } from '../../utils/render_settings_config.js';

function build_html (models_collection, params) {
  return `<div class="model-settings" data-model-type="${models_collection.collection_key}"></div>`;
}
export async function render (models_collection, params) {
  const frag = this.create_doc_fragment(build_html.call(this, models_collection, params));
  const container = frag.firstElementChild;
  post_process.call(this, models_collection, container, params);
  return container;
}
async function post_process (models_collection, container, params) {
  const disposers = [];
  const render_model_settings = async () => {
    const default_model = models_collection.default;
    this.empty(container);
    if (!default_model) return;

    const models_group = render_settings_group(
      `${models_collection.model_type} models`,
      models_collection,
      {},
      container.createDiv(),
      {
        heading_btn: {
          btn_text: '+ New',
          callback: (event, setting) => {
            show_new_model_menu(models_collection, event);
          },
        },
      }
    );

    const models = models_collection.filter(model => !model.deleted)
      // sort default model first, then by display name
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .sort((a, b) => (a === default_model ? -1 : b === default_model ? 1 : 0))
    ;

    for (const model of models) {
      const model_info_el = await models_collection.env.smart_components.render_component('settings_env_model', model, { is_default: model === default_model });
      models_group.listEl.appendChild(model_info_el);
    }
  };
  render_model_settings();
  disposers.push(models_collection.on_event('model:changed', async () => {
    await render_model_settings();
  }));
  this.attach_disposer(container, disposers);
}
