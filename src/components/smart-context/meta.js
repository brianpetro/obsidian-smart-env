function estimate_tokens(char_count) {
  return Math.ceil((char_count || 0) / 4);
}

export function build_html() {
  return `<div>
    <div class="sc-context-view-meta" aria-live="polite"></div>
  </div>`;
}

export async function render(ctx, params = {}) {
  const html = build_html();
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-context-view-meta');
  post_process.call(this, ctx, container, params);
  return container;
}

export async function post_process(ctx, container, params={}) {
  if (!ctx?.has_context_items) return container;
  const chars = ctx.size || 0;
  const tokens = estimate_tokens(chars);
  container.textContent = `≈ ${chars.toLocaleString()} chars · ${tokens.toLocaleString()} tokens`;

  return container;
}
