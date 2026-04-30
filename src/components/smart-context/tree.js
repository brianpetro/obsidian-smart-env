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
  let render_token = 0;

  const render_tree_leaves = () => {
    render_token += 1;
    const token = render_token;
    const env = ctx.env;
    const items = ctx.context_items.filter(params.filter);
    const included_items = items.filter((item) => !item?.data?.exclude); // no excluded items in tree for now (2026-03-24)
    const context_size = get_total_context_size(included_items);
    const tree_root = build_path_tree(included_items);
    const context_item_by_key = included_items.reduce((acc, item) => {
      const item_key = get_item_key(item);
      if (item_key) acc.set(item_key, item);
      return acc;
    }, new Map());
    const list_el = render_tree_list.call(this, tree_root, {
      ctx,
      env,
      context_item_by_key,
      context_size,
      render_token: token,
      get_render_token: () => render_token,
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
    if (target.classList.contains('is-removing')) return;

    event.preventDefault();
    event.stopPropagation();

    const target_path = target.getAttribute('data-path');
    if (!target_path) return;

    set_remove_pending(target);
    try {
      const is_folder = target.closest('.sc-tree-item')?.classList.contains('dir');
      ctx.remove_by_path(target_path, is_folder ? { folder: true } : {});
    } catch (error) {
      clear_remove_pending(target);
      throw error;
    }
  };

  const on_named_context_badge_click = (event) => {
    const badge =  event.target.classList.contains('sc-context-item-origin-named-context') 
      ? event.target
      : event.target.closest('.sc-context-item-origin-named-context')
    ;
    if (!badge) return;
    const ctx_name = badge.getAttribute('data-named-context');
    if (!ctx_name) return;
    
    event.preventDefault();
    event.stopPropagation();
    const named_ctx = ctx.env.smart_contexts.get_named_context(ctx_name);
    if (!named_ctx) return console.warn(`Smart Context: Failed to find named context with name: ${ctx_name}`);
    named_ctx.emit_event('context_selector:open');
  };

  const disposers = [];
  container.addEventListener('click', on_tree_remove_click);
  container.addEventListener('click', on_named_context_badge_click);
  disposers.push(() => container.removeEventListener('click', on_tree_remove_click));
  disposers.push(() => container.removeEventListener('click', on_named_context_badge_click));
  disposers.push(ctx.on_event('context:updated', schedule_render_tree_leaves));
  // add update listeners for named contexts
  ctx.named_contexts.forEach((named_ctx) => {
    disposers.push(named_ctx.on_event('context:updated', schedule_render_tree_leaves));
  });
  this.attach_disposer(container, disposers);
  return container;
}


function get_item_key(item) {
  return item?.key || item?.path || '';
}

function get_item_size(item) {
  const size = Number(item?.size ?? item?.data?.size);
  if (!Number.isFinite(size) || size < 0) return 0;
  return size;
}

function get_total_context_size(items = []) {
  return items.reduce((sum, item) => sum + get_item_size(item), 0);
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
  const context_item = params.context_item_by_key.get(key);

  render_tree_item_shell(tree_item, li, {
    ...params,
    child_list,
    is_context_item: Boolean(context_item),
  });

  if (context_item) {
    params.env.smart_components.render_component('context_item_leaf', context_item, {
      context_size: params.context_size,
      on_remove: (_event, item = context_item) => {
        const item_key = get_item_key(item);
        if (!item_key) return;
        params.ctx.remove_by_path(
          item_key,
          tree_item.is_file ? {} : { folder: true },
        );
      },
    }).then((leaf) => {
      if (params.get_render_token() !== params.render_token) return;
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
    remove_btn.setAttribute('aria-label', 'Remove folder from context');
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

function set_remove_pending(remove_btn) {
  remove_btn.classList.add('is-removing');
  remove_btn.textContent = '';
  remove_btn.setAttribute('aria-label', 'Removing item');
  remove_btn.setAttribute('aria-busy', 'true');
}

function clear_remove_pending(remove_btn) {
  remove_btn.classList.remove('is-removing');
  remove_btn.textContent = '×';
  remove_btn.removeAttribute('aria-busy');
  remove_btn.setAttribute('aria-label', 'Remove item');
}

