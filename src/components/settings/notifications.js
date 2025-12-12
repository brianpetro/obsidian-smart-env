async function build_html(env, opts = {}) {
  let html = `<div class="settings-group">
    <div class="setting-item setting-item-heading">
      <div class="setting-item-name">Muted notices</div>
    </div>
    <div class="setting-items">
  `;
  // let html = `<div class="settings-group muted-notice-container" style="display: flex; flex-direction: column; gap: 10px;">
  //   <h2>Muted notices</h2>
  // `;
  
  if (Object.keys(env.notices.settings?.muted || {}).length) {
    for (const notice in env.notices.settings?.muted) {
      html += `<div class="muted-notice setting-item" data-notice="${notice}" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div class="setting-item-info">
          <div class="setting-item-name">  
            ${notice}
          </div>
        </div>
        <div class="setting-item-control">
          <button class="unmute-button">Unmute</button>
        </div>
      </div>`;
    }
  } else {
    html += `<div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">No muted notices.</div></div></div>`;
  }
  html += `</div>`;
  return html;
}

export async function render(env, opts = {}) {
  let html = await build_html.call(this, env, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, opts);
  return container;
}

async function post_process(env, frag, opts = {}) {
  const unmute_buttons = frag.querySelectorAll('.unmute-button');
  unmute_buttons.forEach(button => {
    button.addEventListener('click', () => {
      const row = button.closest('.muted-notice');
      const notice = row.dataset.notice;
      env.notices.settings.muted[notice] = false;
      delete env.notices.settings.muted[notice];
      row.remove();
    });
  });
}
