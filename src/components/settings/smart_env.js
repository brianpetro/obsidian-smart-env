import styles from './style.css';
export async function build_html(env, params = {}) {
  return `<div class="smart-env-settings-container">
    <div class="sources-container">
      <h1>Sources</h1>
    </div>
    <div class="models-container">
      <h1>Models</h1>
    </div>
    <div class="notifications-container">
      <h1>Notifications</h1>
    </div>
  </div>`;
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
  const models_container = container.querySelector('.models-container');
  const sources_container = container.querySelector('.sources-container');
  const notifications_container = container.querySelector('.notifications-container');
  render_if_available.call(this, 'settings_reimport_sources', env, sources_container);
  render_if_available.call(this, 'settings_sources_folder_exclusions', env, sources_container);
  render_if_available.call(this, 'settings_sources_file_exclusions', env, sources_container);
  render_if_available.call(this, 'settings_sources_excluded_info', env, sources_container);
  render_if_available.call(this, 'settings_sources_pro', env, sources_container);
  render_if_available.call(this, 'settings_env_models', env, models_container);
  render_if_available.call(this, 'settings_notifications', env, notifications_container);
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