
function build_html (env, params) {
  return `<div class="embedding-settings">
    <h2>Embedding Settings</h2>
    <div class="inputs-container">
    </div> 
  </div>`;
}
export async function render (env, params) {
  const frag = this.create_doc_fragment(build_html(env, params));
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}


async function post_process (env, container, params) {
  const platform = env.platforms.new_platform({
    adapter_key: 'transformers',
  });
  const model = platform.new_model({
    model_type: 'embedding',
  });
  // const settings_config = env.smart_sources.embed_model.adapter.settings_config;
  const settings_config = env.smart_sources.embed_model.settings_config;
  const settings = await this.render_settings(settings_config, {
    // scope: env.smart_sources.embed_model,
    scope: model.model_instance,
  });
  const inputs_container = container.querySelector('.inputs-container');
  inputs_container.appendChild(settings);
}