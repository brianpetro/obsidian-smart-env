function build_html (env, params = {}) {
  return `<div>
    <div class="setting-item">
      <div class="info setting-item-info">
        <div class="setting-item-name">Re-import sources</div>
        <div class="setting-item-description">Clear and reload all source data.</div>
      </div>
      <div class="control setting-item-control">
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
    <em class="reimport-notice"></em>
  </div>`;
}

export async function render (env, params = {}) {
  const html = await build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}

async function post_process (env, container, params = {}) {
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
    env.events?.emit('sources:reimported', { time_ms: end - start });
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
  const disposers = [];
  disposers.push(env.events?.on('model:changed', async (payload) => {
    if(payload.collection_key !== 'embedding_models') return;
    // add notice to re-import sources to update embeddings
    container.classList.add('env-setting-highlight');
    const notice = container.querySelector('.reimport-notice');
    notice.textContent = 'Embedding model changed. Please re-import your sources to update their embeddings.';
    container.appendChild(notice);
    env.events.once('sources:reimported', () => {
      reimport_container.classList.remove('env-setting-highlight');
    });
  }));
  this.attach_disposer(container, disposers);
}