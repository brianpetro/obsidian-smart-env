export async function build_html(env, opts = {}) {
  return `
    <div class="smart-env-settings-container">
      <h1>Smart Environment</h1>
    </div>
  `;
}

/**
 * Render environment settings as a DocumentFragment
 */
export async function render(env, opts = {}) {
  const html = await build_html.call(this, env, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, opts);
  return container;
}

/**
 * Sets up event listeners for toggling, fuzzy modals, etc.
 */
export async function post_process(env, container, opts = {}) {
  const exclusion_settings = await env.smart_components.render_component('settings_source_exclusions', env);
  container.appendChild(exclusion_settings);
  const embedding_settings = await env.smart_components.render_component('settings_embeddings', env);
  container.appendChild(embedding_settings);
  return container;
}
