import {chat_completion_platform_options} from '../../utils/model_platforms.js';

function build_html (env, params) {
  return `<div class="chat-completion-settings">
    <h2>Chat settings</h2>
    <div class="chat-completion-platform"></div> 
    <div class="platform-settings"></div>
    <div class="chat-completion-model"></div>
  </div>`;
}
export async function render (env, params) {
  const frag = this.create_doc_fragment(build_html(env, params));
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}


async function post_process (env, container, params) {
  const platform_container = container.querySelector('.chat-completion-platform');
  const chat_completion_model_container = container.querySelector('.chat-completion-model');
  const platform_settings_container = container.querySelector('.platform-settings');
  const render_model_settings = async () => {
    this.empty(platform_container);
    this.empty(chat_completion_model_container);
    this.empty(platform_settings_container);
    platform_container.textContent = 'Loading platform options...';
    const platform_select_dropdown = await env.smart_components.render_component('form_dropdown', env, {
      setting_key: 'models.chat_completion_platform',
      label: 'Chat platform',
      description: 'Select the chat completion platform to use.',
      options: chat_completion_platform_options.map(p => ({ ...p, disabled: env.config.chat_completion_models[p.value] ? false : true })),
      on_change: () => render_model_settings(),
    });
    this.empty(platform_container);
    platform_container.appendChild(platform_select_dropdown);

    const chat_completion_platform = env.settings.models.chat_completion_platform;
    const platform_key = `${chat_completion_platform}#default`;
    const platform = env.model_platforms.items[platform_key]
      ?? env.model_platforms.new_platform({
        key: platform_key,
        adapter_key: chat_completion_platform,
      })
    ;
    const model_key = chat_completion_platform + '#default';
    const model = env.models.items[model_key]
      ?? platform.new_model({
        key: model_key,
        model_type: 'chat_completion',
      })
    ;

    // Render platform settings
    this.empty(platform_settings_container);
    platform_settings_container.textContent = 'Loading model settings...';
    const platform_settings_config = env.config.chat_completion_models[chat_completion_platform].settings_config;
    const settings = await this.render_settings(platform_settings_config, {
      scope: platform,
    });
    this.empty(platform_settings_container);
    platform_settings_container.appendChild(settings);

    // Render model selection dropdown
    this.empty(chat_completion_model_container);
    chat_completion_model_container.textContent = 'Loading model options...';
    const model_options = await model.get_model_key_options();
    const model_select_dropdown = await env.smart_components.render_component('form_dropdown', model, {
      setting_key: 'model_key',
      label: 'Chat model',
      description: 'Select the chat completion model to use.',
      options: model_options,
      on_change: () => render_model_settings(),
    });
    this.empty(chat_completion_model_container);
    chat_completion_model_container.appendChild(model_select_dropdown);
    
  }
  render_model_settings();

}