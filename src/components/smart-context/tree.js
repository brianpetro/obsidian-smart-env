import { build_tree_html } from '../../utils/smart-context/build_tree_html.js';
import styles from './tree.css';

export function build_html(ctx, opts = {}) {
  const items = ctx.get_context_items();
  const list_html = build_tree_html(items);
  return `<div>
    <div class="sc-context-tree" data-context-key="${ctx.data.key}">
    ${list_html}
    </div>
  </div>`;
}

export async function render(ctx, opts = {}) {
  this.apply_style_sheet(styles);
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
  const items = ctx.get_context_items();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const li = container.querySelector(`.sc-tree-item[data-path="${item.key}"]`);
    if (!li){
      console.warn(`Smart Context: Could not find tree item for path: ${item.key}`);
      continue;
    }
    env.smart_components.render_component('context_item_leaf', item).then(leaf => {
      this.empty(li);
      li.appendChild(leaf);
    });
  }

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
  return container;
}
