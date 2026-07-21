import {
  get_scope_env,
  run_action_entry,
} from './command_actions.js';

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
    .map((entry) => {
      return create_menu_ctx(env, menu_key, menu, scope, params, entry);
    })
    .filter(should_show)
  ;
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
    async run(run_params = {}) {
      const spec_params = resolve_params(menu_spec.params, menu_ctx);
      return await run_action_entry(scope, entry.action_key, {
        ...params,
        ...spec_params,
        ...run_params,
        menu_ctx,
        menu_key,
        action_key: entry.action_key,
      }, {
        event_source: run_params.event_source
          || menu_spec.event_source
          || menu_ctx.event_source,
      });
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
    item.onClick?.(async (event, ...click_args) => {
      if (disabled) return false;
      return await menu_ctx.run({
        click_event: event,
        click_args,
      });
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

function resolve_params(value, menu_ctx) {
  const resolved = get_value(value, menu_ctx);
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
