export function build_html() {
  return `<div>
    <div class="sc-context-view-actions">
      <input
        type="text"
        class="sc-context-name-input"
        placeholder="Context name…"
        aria-label="Context name"
      />
      <span class="sc-context-actions-right"></span>
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
  await post_process.call(this, ctx, container, opts);
  return container;
}
export async function post_process(ctx, container, opts = {}) {
  const env = ctx.env;
  const name_input = container.querySelector('.sc-context-name-input');
  const right_slot = container.querySelector('.sc-context-actions-right');

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
  const add_btn = document.createElement('button');
  add_btn.className = 'sc-add-context-btn';
  add_btn.type = 'button';
  add_btn.textContent = 'Add context';
  add_btn.addEventListener('click', () => {
    env.events.emit('context_selector:open', { collection_key: 'smart_contexts', item_key: ctx.key });
  });
  right_slot.appendChild(add_btn);

  // Copy to clipboard button (only when items exist)
  if (ctx.has_context_items) {
    const copy_btn = await ctx.env.render_component('copy_to_clipboard_button', ctx, opts);
    right_slot.appendChild(copy_btn);
  }

  return container;
}
