import { build_tree_html } from '../../utils/smart-context/build_tree_html.js';
import tree_styles from './tree.css';
export function build_html(ctx, params = {}) {
  return `
    <div class="sc-context-tree" data-context-key="${ctx.data.key}"></div>
  `;
}

export async function render(ctx, params = {}) {
  this.apply_style_sheet(tree_styles);
  const html = build_html(ctx, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, params);
  return container;
}

export async function post_process(ctx, container, params = {}) {
  const render_tree_leaves = () => {
    const env = ctx.env;
    const items = ctx.context_items.filter(params.filter);
    const list_html = build_tree_html(items);
    const list_frag = this.create_doc_fragment(list_html);
    this.empty(container);
    container.appendChild(list_frag);
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
  }
  render_tree_leaves();
  
  const disposers = [];
  disposers.push(ctx.on_event('context:updated', render_tree_leaves));
  this.attach_disposer(container, disposers);
  return container;
}
