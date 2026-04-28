import { build_path_tree } from '../../utils/smart-context/build_path_tree.js';
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
  let render_cycle = 0;

  const render_tree_leaves = () => {
    render_cycle += 1;
    const current_render_cycle = render_cycle;
    const env = ctx.env;
    const items = ctx.context_items.filter(params.filter);
    const included_items = items.filter((item) => !item?.data?.exclude); // no excluded items in tree for now (2026-03-24)
    const tree_root = build_path_tree(included_items);
    const item_by_key = included_items.reduce((acc, item) => {
      const item_key = get_item_key(item);
      if (item_key) acc.set(item_key, item);
      return acc;
    }, new Map());
    const list_el = render_tree_list.call(this, tree_root, {
      ctx,
      env,
      item_by_key,
      render_cycle: current_render_cycle,
      get_render_cycle: () => render_cycle,
    });

    this.empty(container);
    if (list_el) container.appendChild(list_el);
  };
  const schedule_render_tree_leaves = create_render_scheduler(render_tree_leaves);
  render_tree_leaves();

  const on_tree_remove_click = (event) => {
    const target = event.target?.closest?.('.sc-context-item-remove');
    if (!target) return;
    if (target.closest('.sc-context-item-leaf')) return;
    event.preventDefault();
    event.stopPropagation();
    const target_path = target.getAttribute('data-path');
    // if closest li has class "dir"
    const li = target.closest('.sc-tree-item');
    if (li && li.classList.contains('dir')) {
      ctx.remove_by_path(target_path, { folder: true });
    } else {
      ctx.remove_by_path(target_path);
    }
  };

  const disposers = [];
  container.addEventListener('click', on_tree_remove_click);
  disposers.push(() => container.removeEventListener('click', on_tree_remove_click));
  disposers.push(ctx.on_event('context:updated', schedule_render_tree_leaves));
  this.attach_disposer(container, disposers);
  return container;
}

function get_item_key(item) {
  return item?.key || item?.path || '';
}

function get_child_nodes(node) {
  if (!node?.children || Array.isArray(node.children)) return [];
  return Object.values(node.children);
}

function sort_tree_items(left, right) {
  if (left.is_file !== right.is_file) return left.is_file ? 1 : -1;
  return left.name.localeCompare(right.name);
}

function render_tree_list(node, params = {}) {
  const child_nodes = get_child_nodes(node);
  if (!child_nodes.length) return null;

  const list_el = document.createElement('ul');
  child_nodes
    .sort(sort_tree_items)
    .forEach((child) => {
      list_el.appendChild(render_tree_item.call(this, child, params));
    })
  ;
  return list_el;
}

function render_tree_item(tree_item, params = {}) {
  const key = get_item_key(tree_item);
  const li = document.createElement('li');
  li.dataset.path = key;
  li.classList.add('sc-tree-item', tree_item.is_file ? 'file' : 'dir');
  if (key.startsWith('external:')) li.classList.add('sc-external');

  const child_list = render_tree_list.call(this, tree_item, params);
  const context_item = params.item_by_key.get(key);

  render_tree_item_shell(tree_item, li, {
    ...params,
    child_list,
    is_context_item: Boolean(context_item),
  });

  if (context_item) {
    params.env.smart_components.render_component('context_item_leaf', context_item, {
      on_remove: (_event, item = context_item) => {
        const item_key = get_item_key(item);
        if (!item_key) return;
        params.ctx.remove_by_path(
          item_key,
          tree_item.is_file ? {} : { folder: true },
        );
      },
    }).then((leaf) => {
      if (params.get_render_cycle() !== params.render_cycle) return;
      if (!leaf) return;

      this.empty(li);
      li.appendChild(leaf);
      if (child_list) li.appendChild(child_list);
    }).catch((error) => {
      console.warn(`Smart Context: Failed to render tree leaf for path: ${key}`, error);
    });
  }

  return li;
}

function render_tree_item_shell(tree_item, li, params = {}) {
  const key = get_item_key(tree_item);
  const has_children = Boolean(params.child_list);

  if (!params.is_context_item && has_children) {
    const remove_btn = document.createElement('span');
    remove_btn.classList.add('sc-context-item-remove');
    remove_btn.dataset.path = key;
    remove_btn.textContent = '×';
    li.appendChild(remove_btn);
  }

  const label = document.createElement('span');
  label.classList.add('sc-tree-label', 'sc-context-item-name');
  if (params.is_context_item) label.classList.add('sc-context-item-placeholder');
  if (tree_item.exists === false) label.classList.add('missing');
  label.textContent = tree_item.name || key;
  li.appendChild(label);

  if (params.child_list) li.appendChild(params.child_list);
}
