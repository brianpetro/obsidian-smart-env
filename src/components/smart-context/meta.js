import { setIcon } from 'obsidian';
function estimate_tokens(char_count) {
  return Math.ceil((char_count || 0) / 4);
}

export function build_html() {
  return `
    <div class="sc-context-meta" aria-live="polite" style="display: flex; gap: 0.5em;"></div>
  `;
}

export async function render(ctx, params = {}) {
  const html = build_html();
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, params);
  return container;
}

export async function post_process(ctx, container, params={}) {
  const render_meta = () => {
    if (ctx?.has_context_items) {
      const chars = ctx.size || 0;
      const tokens = estimate_tokens(chars);
      container.textContent = `≈ ${chars.toLocaleString()} chars · ${tokens.toLocaleString()} tokens`;
    } else {
      container.textContent = 'No context items selected';
    }
  }
  render_meta();
  const disposers = [];
  disposers.push(ctx.on_event('context:updated', render_meta));
  disposers.push(ctx.on_event('smart_context:missing_item', () => {
    console.warn('Context item missing for context', ctx.key);
    // append warning icon
    // append container for icon
    if (container.querySelector('.sc-missing-item-warning')) return;
    const warning_icon = this.create_doc_fragment('<div class="sc-missing-item-warning" style="color: var(--text-warning, var(--color-yellow)); align-items: center; display: flex;"></div>').firstElementChild;
    container.appendChild(warning_icon);
    setIcon(warning_icon, 'alert-triangle');
    warning_icon.setAttribute('title', 'One or more context items are missing. Click to manage.');
  }));
  this.attach_disposer(container, disposers);
  return container;
}
