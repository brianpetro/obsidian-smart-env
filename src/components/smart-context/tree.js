import { build_tree_html } from '../../utils/smart-context/build_tree_html.js';
import tree_styles from './tree.css';
import { get_nested_context_item_keys } from '../../utils/smart-context/tree_utils.js';
import { create_render_scheduler } from '../../utils/render_utils.js';

/**
 * Persist a synthetic folder exclusion for folder-level removals.
 *
 * Synthetic folders exist only in the rendered tree. They are not active
 * context_items until the user removes them, at which point we add a compact
 * exclusion marker so codeblock rewrites can preserve the broader intent.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {string} target_path
 * @returns {void}
 */
function set_synthetic_folder_exclusion(ctx, target_path) {
  if (!ctx?.data) ctx.data = {};
  if (!ctx.data.context_items || typeof ctx.data.context_items !== 'object') {
    ctx.data.context_items = {};
  }

  ctx.data.context_items[target_path] = {
    ...(ctx.data.context_items[target_path] || {}),
    key: target_path,
    exclude: true,
    folder: true,
  };
}

/**
 * Remove a tree target and any nested descendants while emitting one update.
 *
 * Existing derived items (folder-backed or named-context-backed) already know
 * how to toggle themselves into exclusions through SmartContext.remove_items.
 * Only synthetic folder rows need a new exclusion marker written here.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {string} [params.target_path]
 * @returns {string[]}
 */
const remove_nested_context_items = (ctx, params = {}) => {
  const { target_path } = params;
  if (!target_path) return [];

  const nested_keys = get_nested_context_item_keys(ctx, { target_path });
  const existing_item = ctx?.data?.context_items?.[target_path] || null;
  const is_synthetic_folder = !existing_item && nested_keys.length > 0;

  const removed_keys = ctx.remove_items(nested_keys);

  if (is_synthetic_folder) {
    set_synthetic_folder_exclusion(ctx, target_path);
  }

  if (!removed_keys.length && !is_synthetic_folder) return [];

  ctx.queue_save?.();
  ctx.emit_event('context:updated', {
    removed_keys,
    exclusion_key: is_synthetic_folder ? target_path : null,
  });

  return removed_keys;
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
      if (!li) {
        console.warn(`Smart Context: Could not find tree item for path: ${item.key}`);
        continue;
      }
      env.smart_components.render_component('context_item_leaf', item).then((leaf) => {
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
