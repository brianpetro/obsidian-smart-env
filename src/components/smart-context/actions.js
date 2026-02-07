import { setIcon } from 'obsidian';
export function build_html() {
  return `
    <div class="sc-context-actions">
      <div class="sc-context-actions-left">
      </div>
      <div class="sc-context-actions-right">
      </div>
    </div>
  `;
}

export async function render(ctx, opts = {}) {
  const html = build_html();
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, opts);
  return container;
}
async function post_process(ctx, container, opts = {}) {
  const render_ctx_actions = () => {
    const actions_left = container.querySelector('.sc-context-actions-left');
    this.empty(actions_left);
    const actions_right = container.querySelector('.sc-context-actions-right');
    this.empty(actions_right);
    // Add context -> open selector (hidden by CSS in certain views)
    render_btn_open_selector(ctx, actions_right);
    render_btn_copy_context(ctx, actions_right);
    render_btn_clear_context(ctx, actions_right);
    render_btn_help(ctx, actions_right);
  }
  render_ctx_actions();
  const disposers = [];
  disposers.push(ctx.on_event('context:updated', render_ctx_actions));
  this.attach_disposer(container, disposers);

  return container;
}
export function render_btn_open_selector(ctx, container) {
  // const add_btn = container.querySelector('.sc-add-context-btn');
  const add_btn = document.createElement('button');
  add_btn.type = 'button';
  add_btn.className = 'sc-add-context-btn';
  add_btn.textContent = 'Add context';
  container.appendChild(add_btn);
  add_btn.addEventListener('click', () => {
    ctx.emit_event('context_selector:open');
  });
}
export function render_btn_copy_context(ctx, container) {
  // const copy_btn = container.querySelector('.sc-copy-clipboard');
  const copy_btn = document.createElement('button');
  copy_btn.type = 'button';
  copy_btn.className = 'sc-copy-clipboard';
  copy_btn.textContent = 'Copy to clipboard';
  if (!ctx.has_context_items) {
    copy_btn.style.display = 'none';
  }
  container.appendChild(copy_btn);
  copy_btn.addEventListener('click', async () => {
    ctx.actions.context_copy_to_clipboard();
  });
}

export function render_btn_clear_context(ctx, container) {
  // const clear_btn = container.querySelector('.sc-clear-context-btn');
  const clear_btn = document.createElement('button');
  clear_btn.type = 'button';
  clear_btn.className = 'sc-clear-context-btn';
  clear_btn.textContent = 'Clear';
  if (!ctx.has_context_items) {
    clear_btn.style.display = 'none';
  }
  container.appendChild(clear_btn);
  clear_btn.addEventListener('click', () => {
    ctx.clear_all();
  });
}

export function render_btn_help(ctx, container) {
  // const help_btn = container.querySelector('.sc-help-btn');
  const help_btn = document.createElement('button');
  help_btn.type = 'button';
  help_btn.className = 'sc-help-btn';
  help_btn.setAttribute('aria-label', 'Learn more');
  container.appendChild(help_btn);
  setIcon(help_btn, 'help-circle');
  help_btn.addEventListener('click', () => {
    window.open('https://smartconnections.app/smart-context/builder/?utm_source=context-selector-modal', '_external');
  });
}