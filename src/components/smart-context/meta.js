function estimate_tokens(char_count) {
  return Math.ceil((char_count || 0) / 4);
}

export function build_html() {
  return `<div>
    <div class="sc-context-view-meta" aria-live="polite"></div>
  </div>`;
}

export async function render(ctx, opts = {}) {
  const html = build_html();
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-context-view-meta');
  post_process.call(this, ctx, container, opts);
  return container;
}

export async function post_process(ctx, container /* , opts */) {
  if (!ctx?.has_context_items) return container;
  const disposers = [];
  const render_meta = async () => {
    const { stats } = await ctx.compile({ link_depth: 0, calculating: true });
    const chars  = stats?.char_count || 0;
    const tokens = estimate_tokens(chars);
    container.textContent = `≈ ${chars.toLocaleString()} chars · ${tokens.toLocaleString()} tokens`;
  };

  await render_meta();

  const on_updated = (e) => {
    if (e?.item_key && e.item_key !== ctx.key) return;
    render_meta();
  };
  const disposer = ctx.env?.events?.on?.('context:updated', on_updated);
  if (disposer) disposers.push(disposer);

  this.attach_disposer(container, disposers);
  return container;
}
