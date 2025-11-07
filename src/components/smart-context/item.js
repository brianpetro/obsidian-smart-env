/**
 * Compact Smart Context view (header widget)
 * Renders: actions (left), tree (middle), meta (right/bottom)
 */

export function build_html(ctx, opts = {}) {
  return `<div>
    <div class="sc-context-view" data-context-key="${ctx.data.key}">
      <div class="sc-context-view-header">
        <div class="sc-context-view-actions"></div>
      </div>
      <div class="sc-context-view-body">
        <div class="sc-context-view-tree"></div>
      </div>
      <div class="sc-context-view-footer">
        <div class="sc-context-view-meta"></div>
      </div>
    </div>
  </div>`;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 */
export async function render(ctx, opts = {}) {
  const html = build_html(ctx, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-context-view');
  await post_process.call(this, ctx, container, opts);
  return container;
}

export async function post_process(ctx, container, opts = {}) {
  const actions_el = container.querySelector('.sc-context-view-actions');
  const tree_el    = container.querySelector('.sc-context-view-tree');
  const meta_el    = container.querySelector('.sc-context-view-meta');

  const render_children = async () => {
    const actions = await ctx.env.render_component('smart_context_actions', ctx, opts);
    this.empty(actions_el);
    actions_el.appendChild(actions);

    const tree = await ctx.env.render_component('smart_context_tree', ctx, opts);
    this.empty(tree_el);
    tree_el.appendChild(tree);

    const meta = await ctx.env.render_component('smart_context_meta', ctx, opts);
    this.empty(meta_el);
    meta_el.appendChild(meta);
  };

  await render_children();
  return container;
}
