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
  const exclusion_settings = await env.smart_components.render_component('settings_source_exclusions', env);
  container.appendChild(exclusion_settings);
  const embedding_settings = await env.smart_components.render_component('settings_embedding_model', env);
  container.appendChild(embedding_settings);
  const chat_completion_settings = await env.smart_components.render_component('settings_chat_completions', env);
  container.appendChild(chat_completion_settings);
  const muted_notices_frag = await env.render_component('muted_notices', env);
  container.appendChild(muted_notices_frag);
  return container;
}
