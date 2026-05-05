import { build_path_tree } from '../../utils/smart-context/build_path_tree.js';
import tree_styles from './tree.css';
import { create_render_scheduler } from '../../utils/render_utils.js';

const remove_debounce_ms = 1500;

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
  const pending_removals = get_pending_removals(ctx);

  const is_pending_removal = (item_key) => {
    for (const target_path of pending_removals.keys()) {
      if (item_matches_remove_path(item_key, target_path)) return true;
    }
    return false;
  };

  const render_tree_leaves = () => {
    render_token += 1;
    const token = render_token;
    const env = ctx.env;
    const items = ctx.context_items.filter(params.filter);
    const included_items = items
      .filter((item) => !item?.data?.exclude) // no excluded items in tree for now (2026-03-24)
      .filter((item) => !is_pending_removal(get_item_key(item)))
    ;
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
      on_remove_path: (target_path, remove_params, tree_item_el) => {
        remove_tree_item_from_ui(tree_item_el);
        queue_remove_by_path(target_path, remove_params);
      },
    });

    this.empty(container);
    if (list_el) container.appendChild(list_el);
  };
  const schedule_render_tree_leaves = create_render_scheduler(render_tree_leaves);

  const flush_pending_removals = () => {
    if (ctx._remove_by_path_timer) {
      clearTimeout(ctx._remove_by_path_timer);
      ctx._remove_by_path_timer = null;
    }

    const removals = Array.from(pending_removals.entries())
      .map(([target_path, remove_params]) => ({
        path: target_path,
        ...(remove_params?.folder ? { folder: true } : {}),
      }))
    ;
    pending_removals.clear();
    if (!removals.length) return;

    try {
      ctx.remove_by_paths(removals);
    } catch (error) {
      console.warn('Smart Context: Failed to remove queued paths', error);
      schedule_render_tree_leaves();
    }
  };

  const queue_remove_by_path = (target_path, remove_params = {}) => {
    if (!target_path) return;

    for (const pending_path of Array.from(pending_removals.keys())) {
      if (item_matches_remove_path(target_path, pending_path)) return;
      if (item_matches_remove_path(pending_path, target_path)) {
        pending_removals.delete(pending_path);
      }
    }

    pending_removals.set(target_path, remove_params);

    if (ctx._remove_by_path_timer) clearTimeout(ctx._remove_by_path_timer);
    ctx._remove_by_path_timer = setTimeout(flush_pending_removals, remove_debounce_ms);
  };

  render_tree_leaves();

  const on_tree_remove_click = (event) => {
    const target = event.target?.closest?.('.sc-context-item-remove');
    if (!target) return;
    if (target.closest('.sc-context-item-leaf')) return;

    event.preventDefault();
    event.stopPropagation();

    const target_path = target.getAttribute('data-path');
    if (!target_path) return;

    if (target.classList.contains('is-disabled')) {
      emit_named_context_remove_blocked_notice(ctx, target.getAttribute('data-named-context') || '');
      return;
    }

    const tree_item_el = target.closest('.sc-tree-item');
    const is_folder = tree_item_el?.classList.contains('dir');
    remove_tree_item_from_ui(tree_item_el);
    queue_remove_by_path(target_path, {
      ...(is_folder ? { folder: true } : {}),
    });
  };

  const on_named_context_badge_click = (event) => {
    const badge = event.target?.closest?.('.sc-context-item-origin-named-context');
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

function get_context_item_named_context(item) {
  const named_context = item?.data?.from_named_context;
  return typeof named_context === 'string' ? named_context.trim() : '';
}

function get_pending_removals(ctx) {
  if (!(ctx._pending_remove_by_path instanceof Map)) {
    ctx._pending_remove_by_path = new Map();
  }
  return ctx._pending_remove_by_path;
}

function normalize_remove_path(path = '') {
  return String(path || '').replace(/\/+$/g, '');
}

function item_matches_remove_path(item_key = '', target_path = '') {
  const normalized_item_key = normalize_remove_path(item_key);
  const normalized_target_path = normalize_remove_path(target_path);
  if (!normalized_item_key || !normalized_target_path) return false;
  return normalized_item_key === normalized_target_path
    || normalized_item_key.startsWith(normalized_target_path + '/')
    || normalized_item_key.startsWith(normalized_target_path + '#')
    || normalized_item_key.startsWith(normalized_target_path + '{')
  ;
}

function is_core_context(ctx) {
  return ctx?.env?.is_pro !== true;
}

function get_tree_item_named_contexts(tree_item, context_item_by_key, named_contexts = new Set()) {
  const context_item = context_item_by_key.get(get_item_key(tree_item));
  const named_context = get_context_item_named_context(context_item);
  if (named_context) named_contexts.add(named_context);

  get_child_nodes(tree_item).forEach((child) => {
    get_tree_item_named_contexts(child, context_item_by_key, named_contexts);
  });

  return named_contexts;
}

function emit_named_context_remove_blocked_notice(ctx, named_context_name = '') {
  const context_name = String(named_context_name || '').trim();
  const named_ctx = context_name
    ? ctx?.env?.smart_contexts?.get_named_context?.(context_name)
    : null
  ;
  const message = context_name
    ? `This item is included from named context "${context_name}". Open that named context to remove it there.`
    : 'This item is included from a named context. Open the named context to remove it there.'
  ;

  ctx?.emit_event?.('context:named_context_remove_blocked', {
    level: 'warning',
    message,
    event_source: 'smart_context_tree.remove_named_context_child',
    named_context_name: context_name,
    ...(named_ctx ? {
      btn_text: 'Open named context',
      btn_callback: 'context_selector:open',
      btn_event_key: 'context_selector:open',
      btn_event_payload: {
        collection_key: 'smart_contexts',
        item_key: named_ctx.key,
      },
    } : {}),
  });
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
    const named_context = get_context_item_named_context(context_item);
    const remove_disabled = is_core_context(params.ctx) && Boolean(named_context);

    params.env.smart_components.render_component('context_item_leaf', context_item, {
      context_size: params.context_size,
      remove_disabled,
      on_remove_disabled: () => {
        emit_named_context_remove_blocked_notice(params.ctx, named_context);
      },
      on_remove: (_event, item = context_item) => {
        const item_key = get_item_key(item);
        if (!item_key) return;
        params.on_remove_path?.(
          item_key,
          {
            ...(tree_item.is_file ? {} : { folder: true }),
          },
          li,
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
    let named_context = '';
    let remove_disabled = false;
    if (is_core_context(params.ctx)) {
      const named_contexts = get_tree_item_named_contexts(tree_item, params.context_item_by_key);
      remove_disabled = named_contexts.size > 0;
      if (named_contexts.size === 1) named_context = Array.from(named_contexts)[0];
    }

    const remove_btn = document.createElement('span');
    remove_btn.classList.add('sc-context-item-remove');
    if (remove_disabled) remove_btn.classList.add('is-disabled');
    remove_btn.dataset.path = key;
    if (named_context) remove_btn.dataset.namedContext = named_context;
    remove_btn.textContent = '×';
    remove_btn.setAttribute(
      'aria-label',
      remove_disabled ? 'Open named context to edit included items' : 'Remove folder from context'
    );
    if (remove_disabled) {
      remove_btn.setAttribute('aria-disabled', 'true');
      remove_btn.setAttribute('title', 'Open the named context to remove included items.');
    }
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

function remove_tree_item_from_ui(tree_item_el) {
  let current = tree_item_el;

  while (current) {
    const parent_list = current.parentElement;
    const parent_item = parent_list?.closest?.('.sc-tree-item');
    current.remove();

    if (!parent_list) return;
    if (parent_list.children.length === 0) parent_list.remove();
    if (!parent_item) return;
    if (parent_item.querySelector(':scope > .sc-context-item-leaf')) return;

    const child_list = parent_item.querySelector(':scope > ul');
    if (child_list && child_list.children.length > 0) return;

    current = parent_item;
  }
}

