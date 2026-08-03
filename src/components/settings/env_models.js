import { render_settings_group } from '../../utils/render_settings_config.js';
import { ensure_settings_config } from '../../utils/settings_config_utils.js';

function build_html (env, params) {
  const models_collections = [
    env.embedding_models,
    env.chat_completion_models,
    env.ranking_models,
  ].filter(Boolean);
  const type_containers = models_collections.map(models_collection => {
    return `<div data-collection-key="${models_collection.collection_key}"></div>`;
  }).join('\n');
  return `<div class="env-model-types">
    <div class="default-model-settings"></div>
    ${type_containers}
  </div>`;
}
export async function render (env, params) {
  const frag = this.create_doc_fragment(build_html(env, params));
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}
async function post_process (env, container, params) {
  const models_collections = [
    env.embedding_models,
    env.chat_completion_models,
    env.ranking_models,
  ].filter(Boolean);
  const default_settings_container = container.querySelector('.default-model-settings');
  const render_default_model_settings = () => {
    const default_settings_config = {};
    for (const models_collection of models_collections) {
      if (!models_collection.default) continue;
      const settings_config = ensure_settings_config(
        models_collection.env_config.settings_config,
        models_collection
      );
      const default_setting = settings_config.default_model_key;
      if (!default_setting) continue;
      default_settings_config[`${models_collection.collection_key}.default_model_key`] = default_setting;
    }
    this.empty(default_settings_container);
    render_settings_group(
      'Smart Environment settings',
      env,
      default_settings_config,
      default_settings_container
    );
  };
  render_default_model_settings();

  const disposers = models_collections.map(models_collection => {
    return models_collection.on_event('model:changed', render_default_model_settings);
  });
  this.attach_disposer(container, disposers);

  const collection_containers = container.querySelectorAll('div[data-collection-key]');
  for (const collection_container of collection_containers) {
    const collection_key = collection_container.getAttribute('data-collection-key');
    const models_collection = env[collection_key];
    env.smart_components.render_component('settings_env_model_type', models_collection).then((model_type_el) => {
      this.empty(collection_container);
      collection_container.appendChild(model_type_el);
    });
  }

  return container;
}
