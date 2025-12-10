import { SmartModelModal, show_new_model_menu } from '../../modals/smart_model_modal.js';

function build_html (models_collection, params) {
  return `<div class="model-settings" data-model-type="${models_collection.collection_key}">
    <div class="smart-env-settings-header">
      <h2>${models_collection.model_type} models</h2>
      <button class="new-model">New</button>
    </div>
    <div class="global-settings"></div>
    <div class="model-info"></div>
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
  const global_settings_container = container.querySelector('.global-settings');
  const model_info_container = container.querySelector('.model-info');
  const default_setting = await this.render_settings(models_collection.env_config.settings_config, {
    scope: models_collection,
  });
  global_settings_container.appendChild(default_setting);
  const new_model_btn = container.querySelector('.new-model');
  new_model_btn.addEventListener('click', async (event) => {
    show_new_model_menu(models_collection, event);
  });
  const render_current_model_info = async () => {
    const current_model = models_collection.default;
    models_collection.env.smart_components.render_component('settings_env_model', current_model, {}).then((model_info_el) => {
      this.empty(model_info_container);
      model_info_container.appendChild(model_info_el);
    });
  };
  render_current_model_info();
  disposers.push(models_collection.on_event('settings:changed', async (payload) => {
    const default_setting_path = `${models_collection.collection_key}.default_model_key`;
    if(payload.path_string === default_setting_path) {
      await render_current_model_info();
    }
  }));
  disposers.push(models_collection.on_event('model:changed', async () => {
    await render_current_model_info();
  }));
  this.attach_disposer(container, disposers);
}