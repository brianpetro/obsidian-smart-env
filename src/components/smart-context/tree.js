import { build_tree_html } from '../../utils/smart-context/build_tree_html.js';

export function build_html(ctx, opts = {}) {
  return `<div>
    <div class="sc-context-tree"></div>
  </div>`;
}

export async function render(ctx, opts = {}) {
  const html = build_html(ctx, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-context-tree');
  post_process.call(this, ctx, container, opts);
  return container;
}

function test_has_children(li) { return !!li.querySelector(':scope > ul'); }
function toggle_collapsed(li)  { li.classList.toggle('collapsed'); }

export async function post_process(ctx, container, opts = {}) {
  const env = ctx.env;
  const disposers = [];

  const render_tree = () => {
    const items = ctx.get_context_items();
    const list_html = build_tree_html(items);
    const frag = this.create_doc_fragment(list_html);
    this.empty(container);
    container.appendChild(frag);

    // Remove item -> SmartContext.remove_item (should emit context:updated)
    container.querySelectorAll('.sc-tree-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const path = btn.dataset.path;
        if (!path) return;
        if (typeof ctx.remove_item === 'function') ctx.remove_item(path);
      });
    });

    // Expand/collapse directories in-tree
    container.querySelectorAll('.sc-tree-item.dir').forEach(li => {
      if (!test_has_children(li)) return;
      li.classList.add('expandable');
      const label = li.querySelector(':scope > .sc-tree-label');
      if (!label) return;
      label.addEventListener('click', ev => {
        if (ev.metaKey || ev.ctrlKey) return;
        ev.preventDefault();
        ev.stopPropagation();
        toggle_collapsed(li);
      });
    });
  };

  render_tree();

  // Refresh when this context updates
  const on_updated = (e) => {
    if (e?.item_key && e.item_key !== ctx.key) return;
    render_tree();
  };
  const disposer = env?.events?.on?.('context:updated', on_updated);
  if (disposer) disposers.push(disposer);

  this.attach_disposer(container, disposers);
  return container;
}
