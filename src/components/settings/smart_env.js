import styles from './style.css';
export async function build_html(env, opts = {}) {
  return `
    <div class="smart-env-settings-container">
      <div class="smart-env-settings-header" id="smart-env-buttons">
        <h1>Smart Environment</h1>
        <button class="smart-env-re-import-sources-btn" type="button">Re-import sources</button>
        <div class="sc-inline-confirm-row" style="display: none;">
          <span style="margin-right: 10px;">
            Are you sure you want to clear all sources data? This cannot be undone.
          </span>
          <span class="sc-inline-confirm-row-buttons">
            <button class="sc-inline-confirm-yes">Yes</button>
            <button class="sc-inline-confirm-cancel">Cancel</button>
          </span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render environment settings as a DocumentFragment
 */
export async function render(env, opts = {}) {
  this.apply_style_sheet(styles);
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
  const reimport_btn = container.querySelector('.smart-env-re-import-sources-btn');
  const confirm_row = container.querySelector('.sc-inline-confirm-row');
  const confirm_yes = container.querySelector('.sc-inline-confirm-yes');
  const confirm_cancel = container.querySelector('.sc-inline-confirm-cancel');
  reimport_btn.addEventListener('click', async () => {
    confirm_row.style.display = 'block';
    reimport_btn.style.display = 'none';
  });
  confirm_yes.addEventListener('click', async (e) => {
    confirm_cancel.style.display = 'none';
    confirm_yes.textContent = 'Re-importing...';
    confirm_yes.disabled = true;
    const confirm_row = e.target.closest('.sc-inline-confirm-row');
    await env.smart_sources.run_clear_all();
    const start = Date.now();
    env.smart_sources.unload();
    env.smart_blocks.unload();
    await env.init_collections();
    await env.load_collections();
    await env.smart_sources.process_embed_queue();
    const end = Date.now();
    env.events?.emit('sources:reloaded', { time_ms: end - start });
    env.main.notices?.show('reload_sources', { time_ms: end - start });
    confirm_row.style.display = 'none';
    reimport_btn.style.display = 'inline-block';
    confirm_yes.textContent = 'Yes';
    confirm_yes.disabled = false;
  });
  confirm_cancel.addEventListener('click', (e) => {
    const confirm_row = e.target.closest('.sc-inline-confirm-row');
    confirm_row.style.display = 'none';
    reimport_btn.style.display = 'inline-block';
  });
  const exclusion_settings = await env.smart_components.render_component('settings_source_exclusions', env);
  container.appendChild(exclusion_settings);
  const embedding_settings = await env.smart_components.render_component('settings_embeddings', env);
  container.appendChild(embedding_settings);
  return container;
}
