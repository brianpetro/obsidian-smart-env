import { show_new_model_menu } from '../../utils/smart-models/show_new_model_menu.js';
import { render_settings_config } from '../../utils/render_settings_config.js';

function build_html (models_collection, params) {
  return `<div class="model-settings" data-model-type="${models_collection.collection_key}">
    <div class="global-settings"></div>
  </div>`;
}
export async function render (models_collection, params) {
  const frag = this.create_doc_fragment(build_html.call(this, models_collection, params));
  const container = frag.firstElementChild;
  post_process.call(this, models_collection, container, params);
  return container;
}
async function post_process (models_collection, container, params) {
  const disposers = [];
  const render_current_model_info = async (current_model) => {
    this.empty(container);
    const [settings_group] = render_settings_config(
      models_collection.env_config.settings_config,
      models_collection,
      container,
      {
        default_group_name: `${models_collection.model_type} models`,
        heading_btn: {
          btn_text: '+ New',
          callback: (event, setting) => {
            show_new_model_menu(models_collection, event);
          },
        },
      }
    );
    
    models_collection.env.smart_components.render_component('settings_env_model', current_model, {}).then((model_info_el) => {
      settings_group.listEl.appendChild(model_info_el);
    });
  };
  render_current_model_info(models_collection.default);
  disposers.push(models_collection.on_event('settings:changed', async (payload) => {
    const default_setting_path = `${models_collection.collection_key}.default_model_key`;
    if(payload.path_string === default_setting_path) {
      await render_current_model_info(models_collection.default);
    }
  }));
  disposers.push(models_collection.on_event('model:changed', async () => {
    await render_current_model_info(models_collection.default);
  }));
  this.attach_disposer(container, disposers);
}