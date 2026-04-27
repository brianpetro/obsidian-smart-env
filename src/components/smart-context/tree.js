import { build_tree_html } from '../../utils/smart-context/build_tree_html.js';
import tree_styles from './tree.css';
import { create_render_scheduler } from '../../utils/render_utils.js';

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
  const plugin = ctx?.env?.plugin;
  const register_dom_event =
    plugin?.registerDomEvent?.bind(plugin) || ((el, evt, cb) => el.addEventListener(evt, cb));
  const render_tree_leaves = () => {
    const env = ctx.env;
    const items = ctx.context_items.filter(params.filter);
    const included_items = items.filter((item) => !item.data.exclude); // no excluded items in tree for now (2026-03-24)
    const list_html = build_tree_html(included_items);
    const list_frag = this.create_doc_fragment(list_html);
    this.empty(container);
    container.appendChild(list_frag);
    for (let i = 0; i < included_items.length; i++) {
      const item = included_items[i];
      const li = container.querySelector(`.sc-tree-item[data-path="${item.key}"]`);
      if (!li) {
        console.warn(`Smart Context: Could not find tree item for path: ${item.key}`);
        continue;
      }
      const child_lists = Array.from(li.children).filter((child) => child.tagName === 'UL');
      env.smart_components.render_component('context_item_leaf', item).then((leaf) => {
        this.empty(li);
        li.appendChild(leaf);
        child_lists.forEach((child_list) => li.appendChild(child_list));
      });
    }
  };
  const schedule_render_tree_leaves = create_render_scheduler(render_tree_leaves);
  render_tree_leaves();

  register_dom_event(container, 'click', (event) => {
    const target = event.target.closest('.sc-context-item-remove');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const target_path = target.getAttribute('data-path');
    // if closest li has class "dir"
    const li = target.closest('.sc-tree-item');
    if (li && li.classList.contains('dir')) {
      ctx.remove_by_path(target_path, {folder: true});
    } else {
      ctx.remove_by_path(target_path);
    }
  });

  const disposers = [];
  disposers.push(ctx.on_event('context:updated', schedule_render_tree_leaves));
  this.attach_disposer(container, disposers);
  return container;
}

