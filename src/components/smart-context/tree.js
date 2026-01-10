import { build_tree_html } from '../../utils/smart-context/build_tree_html.js';
import tree_styles from './tree.css';
import { get_nested_context_item_keys } from './tree_utils.js';

/**
 * @param {Function} callback
 * @returns {void}
 */
const schedule_next_frame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
};

/**
 * @param {Function} render_fn
 * @returns {Function}
 */
const create_render_scheduler = (render_fn) => {
  let render_pending = false;
  return () => {
    if (render_pending) return;
    render_pending = true;
    schedule_next_frame(() => {
      render_pending = false;
      render_fn();
    });
  };
};

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {string} params.target_path
 * @returns {void}
 */
const remove_nested_context_items = (ctx, params = {}) => {
  const { target_path } = params;
  const nested_keys = get_nested_context_item_keys(ctx, { target_path });
  ctx.remove_items(nested_keys);
};
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
  };
  const schedule_render_tree_leaves = create_render_scheduler(render_tree_leaves);
  render_tree_leaves();

  register_dom_event(container, 'click', (event) => {
    const target = event.target.closest('.sc-context-item-remove');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const target_path = target.getAttribute('data-path');
    remove_nested_context_items(ctx, { target_path });
  });
  
  const disposers = [];
  disposers.push(ctx.on_event('context:updated', schedule_render_tree_leaves));
  this.attach_disposer(container, disposers);
  return container;
}
