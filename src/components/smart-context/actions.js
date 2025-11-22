export function build_html() {
  return `<div>
    <div class="sc-context-view-actions">
      <input
        type="text"
        class="sc-context-name-input"
        placeholder="Context name…"
        aria-label="Context name"
      />
      <span class="sc-context-actions-right">
        <button class="sc-add-context-btn" type="button">Add context</button>
        <button class="sc-clear-context-btn" type="button" style="display:none;">Clear</button>
        <button class="sc-copy-clipboard" type="button" style="display:none;">Copy to clipboard</button>
      </span>
    </div>
  </div>`;
}

/**
 * Normalize a human-entered name.
 * @param {string} name
 * @returns {string}
 */
export function sanitize_context_name(name) {
  const str = String(name ?? '').trim();
  if (!str) return '';
  const collapsed = str.replace(/\s+/g, ' ');
  const max = 120;
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
}

export async function render(ctx, opts = {}) {
  const html = build_html();
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-context-view-actions');
  post_process.call(this, ctx, container, opts);
  return container;
}
async function post_process(ctx, container, opts = {}) {
  const render_ctx_actions = () => {
    const name_input = container.querySelector('.sc-context-name-input');
  
    const refresh_name = () => {
      name_input.value = ctx?.data?.name ? String(ctx.data.name) : '';
    };
  
    const save_name = () => {
      const next = sanitize_context_name(name_input.value);
      if (next === (ctx.data.name || '')) return;
      ctx.name = next;
    };
  
    refresh_name();
  
    name_input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save_name();
        name_input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        refresh_name();
        name_input.blur();
      }
    });
    name_input.addEventListener('blur', () => save_name());
  
    // Add context -> open selector (hidden by CSS in certain views)
    const add_btn = container.querySelector('.sc-add-context-btn');
    add_btn.addEventListener('click', () => {
      ctx.emit_event('context_selector:open');
    });
  
    // Copy to clipboard button (only when items exist)
    if (ctx.has_context_items) {
      const copy_btn = container.querySelector('.sc-copy-clipboard');
      copy_btn.style.display = 'inline-block';
      copy_btn.addEventListener('click', async () => {
        ctx.actions.context_copy_to_clipboard();
      });
      const clear_btn = container.querySelector('.sc-clear-context-btn');
      clear_btn.style.display = 'inline-block';
      clear_btn.addEventListener('click', () => {
        ctx.clear_all();
      });
    }
  }
  render_ctx_actions();
  const disposers = [];
  disposers.push(ctx.on_event('context:updated', render_ctx_actions));
  this.attach_disposer(container, disposers);

  return container;
}
