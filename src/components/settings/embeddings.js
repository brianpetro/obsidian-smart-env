import {embedding_platform_options} from '../../utils/model_platforms.js';

function build_html (env, params) {
  return `<div class="embedding-settings">
    <h2>Embedding Settings</h2>
    <div class="embedding-platform"></div> 
    <div class="embedding-model"></div>
    <div class="embedding-model-settings"></div>
  </div>`;
}
export async function render (env, params) {
  const frag = this.create_doc_fragment(build_html(env, params));
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}


async function post_process (env, container, params) {
  const platform_container = container.querySelector('.embedding-platform');
  const embedding_model_container = container.querySelector('.embedding-model');
  const embedding_model_settings_container = container.querySelector('.embedding-model-settings');
  const render_model_settings = async () => {
    this.empty(platform_container);
    this.empty(embedding_model_container);
    this.empty(embedding_model_settings_container);
    platform_container.textContent = 'Loading platform options...';
    const platform_select_dropdown = await env.smart_components.render_component('form_dropdown', env, {
      setting_key: 'models.embedding_platform',
      label: 'Embedding platform',
      description: 'Select the embedding platform to use.',
      options: embedding_platform_options.map(p => ({ ...p, disabled: env.config.embedding_models[p.value] ? false : true })),
      on_change: () => render_model_settings(),
    });
    this.empty(platform_container);
    platform_container.appendChild(platform_select_dropdown);

    const embedding_platform = env.settings.models.embedding_platform;
    const platform_key = `${embedding_platform}#default`;
    const platform = env.model_platforms.items[platform_key]
      ?? env.model_platforms.new_platform({
        key: platform_key,
        adapter_key: embedding_platform,
      })
    ;
    const model_key = embedding_platform + '#default';
    const model = env.models.items[model_key]
      ?? platform.new_model({
        key: model_key,
        model_type: 'embedding',
      })
    ;
    this.empty(embedding_model_container);
    embedding_model_container.textContent = 'Loading model options...';
    const model_options = await model.get_model_key_options();
    const model_select_dropdown = await env.smart_components.render_component('form_dropdown', model, {
      setting_key: 'model_key',
      label: 'Embedding model platform',
      description: 'Select the embedding platform to use.',
      options: model_options,
      on_change: () => render_model_settings(),
    });
    this.empty(embedding_model_container);
    embedding_model_container.appendChild(model_select_dropdown);
    
    this.empty(embedding_model_settings_container);
    embedding_model_settings_container.textContent = 'Loading model settings...';
    const settings_config = env.config.embedding_models[embedding_platform].settings_config;
    const settings = await this.render_settings(settings_config, {
      scope: model,
    });
    this.empty(embedding_model_settings_container);
    embedding_model_settings_container.appendChild(settings);
  }
  render_model_settings();

}