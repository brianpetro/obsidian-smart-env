import styles from './style.css';
export async function build_html(env, params = {}) {
  return `<div class="smart-env-settings-container"></div>`;
}

/**
 * Render environment settings as a DocumentFragment
 */
export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const html = await build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}

/**
 * Sets up event listeners for toggling, fuzzy modals, etc.
 */
export async function post_process(env, container, opts = {}) {
  const reimport_sources = await env.smart_components.render_component('settings_reimport_sources', env);
  container.appendChild(reimport_sources);
  render_if_available.call(this, 'settings_sources_folder_exclusions', env, container);
  render_if_available.call(this, 'settings_sources_file_exclusions', env, container);
  render_if_available.call(this, 'settings_sources_excluded_info', env, container);
  render_if_available.call(this, 'settings_env_models', env, container);
  // const embedding_settings = await env.smart_components.render_component('settings_embedding_model', env);
  // container.appendChild(embedding_settings);
  // const chat_completion_settings = await env.smart_components.render_component('settings_chat_completions', env);
  // container.appendChild(chat_completion_settings);
  // render_if_available.call(this, 'settings_ranking_model', env, container);
  const muted_notices_frag = await env.render_component('muted_notices', env);
  container.appendChild(muted_notices_frag);
  return container;
}

function render_if_available(component_key, env, container) {
  if(env.config.components[component_key]) {
    const placeholder = this.create_doc_fragment(`<div data-component="${component_key}"></div>`).firstElementChild;
    container.appendChild(placeholder);
    env.smart_components.render_component(component_key, env).then((comp_el) => {
      this.empty(placeholder);
      placeholder.appendChild(comp_el);
    });
  }
}