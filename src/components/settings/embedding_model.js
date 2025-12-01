import {embedding_platform_options} from '../../utils/model_platforms.js';

function build_html (env, params) {
  return `<div class="embedding-settings">
    <h2>Embedding model</h2>
    <div class="settings-group">
  </div>`;
}
export async function render (env, params) {
  const frag = this.create_doc_fragment(build_html(env, params));
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}


async function post_process (env, container, params) {
  const settings_group = container.querySelector('.settings-group');
  const changed_model_key = async (model) => {
    model.queue_save();
    model.collection.process_save_queue();
    model.collection.settings.default_model_key = model.key;
    model.emit_event('model:changed');
  }
  const changed_provider = (provider_key, change_scope) => {
    const model = env.embedding_models.filter(m => m.provider_key === provider_key)[0]
      || env.embedding_models.new_model({ provider_key })
    ;
    change_model_key(model);
    render_model_settings(model);
  }

  const render_model_settings = async (model) => {
    if(!model) model = env.embedding_models.default;
    this.empty(settings_group);
    settings_group.textContent = 'Loading embedding options...';
    const provider_select_dropdown = await env.smart_components.render_component('form_dropdown', model, {
      setting_key: 'provider_key',
      label: 'Embedding provider',
      description: 'Select the embedding provider to use.',
      options: embedding_platform_options.map(p => ({ ...p, disabled: !model.env_config.providers[p.value] })),
      on_change: (provider_key, change_scope) => changed_provider(provider_key, change_scope),
    });
    this.empty(settings_group);
    settings_group.appendChild(provider_select_dropdown);
    const model_options = await model.get_model_key_options();
    const model_select_dropdown = await env.smart_components.render_component('form_dropdown', model, {
      setting_key: 'model_key',
      label: 'Embedding model',
      description: 'Select the embedding model to use.',
      options: model_options,
      on_change: () => changed_model_key(model),
    });
    settings_group.appendChild(model_select_dropdown);
    const settings_config = model.provider_config.settings_config;
    const settings = await this.render_settings(settings_config, {
      scope: model,
    });
    settings_group.appendChild(settings);
  }
  render_model_settings();

}