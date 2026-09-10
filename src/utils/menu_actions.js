import {
  get_scope_env,
  is_action_scope_compatible,
  run_action_entry,
} from 'smart-environment';

const submenu_hover_menus = new WeakSet();

/**
 * Build configured menu entries for a menu instance.
 *
 * One build call has one natural action scope. Secondary entities belong in
 * params. A physical menu that contains independent scopes composes multiple
 * build_menu calls before the menu is shown.
 *
 * @param {object} env
 * @param {string} menu_key
 * @param {object} menu
 * @param {object} scope
 * @param {object} [params={}]
 * @returns {object}
 */
export function build_menu(env, menu_key, menu, scope, params = {}) {
  if (!env || !menu || !menu_key) return menu;

  const menu_contexts = resolve_menu_contexts(
    env,
    menu_key,
    menu,
    scope,
    params,
  );

  menu_contexts.forEach((menu_ctx) => {
    build_menu_entry(menu_ctx);
  });

  if (menu_contexts.length) bind_submenu_hover(menu);

  return menu;
}

/**
 * Resolve visible actions for a logical menu without constructing or mutating
 * a native menu.
 *
 * Custom builders are returned as `menu_only` because their native submenu or
 * multi-item output cannot be represented as one direct action button.
 *
 * @param {object} env
 * @param {string} menu_key
 * @param {object} scope
 * @param {object} [params={}]
 * @returns {Array<{
 *   action_key:string,
 *   title:string,
 *   icon:string,
 *   disabled:boolean,
 *   order:number,
 *   menu_only:boolean,
 *   event_source:string,
 *   run:(run_params?:object)=>Promise<*>
 * }>}
 */
export function resolve_menu_actions(env, menu_key, scope, params = {}) {
  if (!env || !menu_key) return [];

  return resolve_menu_contexts(
    env,
    menu_key,
    null,
    scope,
    params,
  )
    .filter((menu_ctx) => !menu_ctx.menu_spec.separator)
    .map((menu_ctx) => {
      const disabled = get_disabled(menu_ctx);

      return {
        action_key: menu_ctx.action_key,
        title: get_title(menu_ctx),
        icon: get_icon(menu_ctx),
        disabled,
        order: get_menu_order(menu_ctx),
        menu_only: typeof menu_ctx.menu_spec.build === 'function',
        event_source: menu_ctx.event_source,
        async run(run_params = {}) {
          if (disabled) return false;
          return await menu_ctx.run(run_params);
        },
      };
    })
  ;
}

/**
 * Collect action entries that declare placement in the target menu.
 *
 * Placement discovery uses unbound action entries. Action getters are reserved
 * for callable resolution so building a menu does not enumerate or instantiate
 * every action on a scope proxy.
 *
 * @param {object} env
 * @param {string} menu_key
 * @returns {Array<object>}
 */
export function collect_menu_entries(env, menu_key) {
  const entries = new Map();

  Object.entries(env?.config?.actions || {}).forEach(([action_key, action_entry]) => {
    const menu_spec = get_menu_spec(action_entry, menu_key);
    if (!menu_spec) return;
    entries.set(action_key, {
      action_key,
      action_entry,
      menu_spec,
    });
  });

  return Array.from(entries.values());
}

function resolve_menu_contexts(env, menu_key, menu, scope, params) {
  try {
    if (get_scope_env(scope) !== env) return [];
  } catch {
    return [];
  }

  return collect_menu_entries(env, menu_key)
    .sort(compare_entries)
    .filter(({ action_entry }) => {
      return is_action_scope_compatible(
        env,
        action_entry.action_scope,
        scope,
      );
    })
    .map((entry) => {
      return create_menu_ctx(env, menu_key, menu, scope, params, entry);
    })
    .filter(should_show)
  ;
}

/**
 * Keep an open submenu from blocking hover navigation to an adjacent item.
 *
 * Use the native selection and submenu lifecycle so positioning, keyboard
 * navigation, and dismissal remain owned by Obsidian. Capture only switches
 * away from an open child; let native handling open the first submenu.
 *
 * @param {object} menu
 */
function bind_submenu_hover(menu) {
  if (!Array.isArray(menu?.items)) return;

  const submenu_items = menu.items.filter((item) => item?.submenu);
  if (!submenu_items.length) return;

  // Revisit children when multiple logical menus compose into one menu.
  submenu_items.forEach((item) => bind_submenu_hover(item.submenu));

  if (
    submenu_hover_menus.has(menu)
    || typeof menu.dom?.addEventListener !== 'function'
    || typeof menu.closeSubmenu !== 'function'
    || typeof menu.select !== 'function'
    || typeof menu.openSubmenu !== 'function'
  ) return;

  const on_menu_hover = (event) => {
    const item_dom = event.target?.closest?.('.menu-item');
    if (!item_dom) return;

    // A nested menu's events must not change an ancestor menu's selection.
    const item_index = menu.items.findIndex((item) => item?.dom === item_dom);
    const item = menu.items[item_index];
    if (
      !item
      || item.disabled
      || !menu.currentSubmenu
      || menu.currentSubmenu === item.submenu
    ) return;

    menu.closeSubmenu();
    menu.select(item_index);
    if (item.submenu) menu.openSubmenu(item);
  };

  menu.dom.addEventListener('pointerover', on_menu_hover, true);
  menu.dom.addEventListener('mouseover', on_menu_hover, true);
  submenu_hover_menus.add(menu);
}

function build_menu_entry(menu_ctx) {
  const { menu_spec } = menu_ctx;

  if (menu_spec.separator) {
    add_separator(menu_ctx);
    return;
  }

  if (typeof menu_spec.build === 'function') {
    menu_spec.build.call(menu_ctx, menu_ctx);
    return;
  }

  add_item(menu_ctx);
}

function create_menu_ctx(env, menu_key, menu, scope, params, entry) {
  const menu_spec = entry.menu_spec;
  const menu_ctx = {
    env,
    menu_key,
    menu,
    scope,
    params,
    action_key: entry.action_key,
    action_entry: entry.action_entry,
    menu_spec,
    owner: entry.action_entry?.owner || null,
    get items() {
      return Array.isArray(menu?.items) ? menu.items : [];
    },
    get event_source() {
      return `menu:${menu_key}:${entry.action_key}`;
    },
    resolve_action() {
      const scoped_action = scope.actions?.[entry.action_key];
      return typeof scoped_action === 'function'
        ? scoped_action
        : entry.action_entry?.action?.bind(scope)
      ;
    },
    async run(run_params = {}, event = null) {
      const spec_params = resolve_params(
        menu_spec.params,
        menu_ctx,
        event,
      );
      const {
        event: _event,
        click_event: _click_event,
        click_args: _click_args,
        ...base_params
      } = params || {};
      const {
        menu_ctx: _menu_ctx,
        menu_key: _menu_key,
        action_key: _action_key,
        event_source: _event_source,
        ...action_params
      } = {
        ...base_params,
        ...spec_params,
        ...run_params,
      };

      return await run_action_entry(
        scope,
        entry.action_key,
        action_params,
        {
          event_source: menu_spec.event_source
            || menu_ctx.event_source,
        },
      );
    },
  };

  return menu_ctx;
}

function add_item(menu_ctx) {
  if (typeof menu_ctx.menu?.addItem !== 'function') return;

  const title = get_title(menu_ctx);
  const icon = get_icon(menu_ctx);
  const disabled = get_disabled(menu_ctx);
  const order = get_menu_order(menu_ctx);

  menu_ctx.menu.addItem((item) => {
    item._menu_key = menu_ctx.menu_key;
    item._action_key = menu_ctx.action_key;
    item._order = order;

    if (title) item.setTitle?.(title);
    if (icon) item.setIcon?.(icon);
    item.setDisabled?.(disabled);
    item.onClick?.(async (event) => {
      if (disabled) return false;
      return await menu_ctx.run({}, event);
    });
  });
}

function add_separator(menu_ctx) {
  if (typeof menu_ctx.menu?.addSeparator !== 'function') return;

  menu_ctx.menu.addSeparator();
  const item = menu_ctx.items[menu_ctx.items.length - 1];
  if (!item) return;

  item._menu_key = menu_ctx.menu_key;
  item._action_key = menu_ctx.action_key;
  item._order = get_menu_order(menu_ctx);
}

function should_show(menu_ctx) {
  if (typeof menu_ctx.menu_spec.when === 'undefined') return true;
  return Boolean(get_value(menu_ctx.menu_spec.when, menu_ctx));
}

function get_disabled(menu_ctx) {
  if (typeof menu_ctx.menu_spec.disabled === 'undefined') return false;
  return Boolean(get_value(menu_ctx.menu_spec.disabled, menu_ctx));
}

function get_title(menu_ctx) {
  return get_value(menu_ctx.menu_spec.title, menu_ctx)
    || get_value(menu_ctx.menu_spec.display_name, menu_ctx)
    || menu_ctx.action_entry?.display_name
    || menu_ctx.action_entry?.title
    || humanize(menu_ctx.action_key)
  ;
}

function get_icon(menu_ctx) {
  return get_value(menu_ctx.menu_spec.icon, menu_ctx)
    || menu_ctx.action_entry?.icon
    || menu_ctx.action_entry?.display_icon
    || ''
  ;
}

function get_menu_order(menu_ctx) {
  return get_order(
    menu_ctx.menu_spec.order ?? menu_ctx.action_entry?.order,
  );
}

function get_menu_spec(action_entry, menu_key) {
  const menus = action_entry?.menus;
  if (!menus || !Object.prototype.hasOwnProperty.call(menus, menu_key)) {
    return null;
  }
  return normalize_menu_spec(menus[menu_key]);
}

function normalize_menu_spec(menu_spec) {
  if (
    menu_spec === false
    || menu_spec === null
    || typeof menu_spec === 'undefined'
  ) {
    return null;
  }
  if (menu_spec === true) return {};
  if (typeof menu_spec === 'function') return { build: menu_spec };
  if (is_object(menu_spec)) return menu_spec;
  throw new TypeError('Invalid menu specification.');
}

function get_value(value, menu_ctx) {
  return typeof value === 'function'
    ? value.call(menu_ctx, menu_ctx)
    : value
  ;
}

function resolve_params(value, menu_ctx, event = null) {
  const resolved = typeof value === 'function'
    ? value.call(menu_ctx, menu_ctx, event)
    : value
  ;
  return is_object(resolved) ? resolved : {};
}

function get_order(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 0;
}

function compare_entries(left, right) {
  const order_delta = get_order(
    left.menu_spec.order ?? left.action_entry?.order,
  ) - get_order(
    right.menu_spec.order ?? right.action_entry?.order,
  );
  if (order_delta) return order_delta;
  return left.action_key.localeCompare(right.action_key);
}

function humanize(action_key = '') {
  return String(action_key)
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
  ;
}

function is_object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
