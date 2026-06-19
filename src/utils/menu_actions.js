/**
 * Register either a legacy menu builder or an action entry with `menus` metadata.
 *
 * Supported forms:
 * - register_menu_action(env, menu_key, fn)
 * - register_menu_action(env, menu_key, action_key, action_entry)
 *
 * @param {object} env
 * @param {string} menu_key
 * @param {Function|string} fn_or_action_key
 * @param {Function|object|null} [action_entry=null]
 * @returns {*}
 */
export function register_menu_action(env, menu_key, fn_or_action_key, action_entry = null) {
  if (!env || !menu_key) return null;

  if (typeof fn_or_action_key === 'function' && action_entry === null) {
    env._registered_menu_actions ||= {};
    env._registered_menu_actions[menu_key] ||= new Set();
    env._registered_menu_actions[menu_key].add(fn_or_action_key);
    return fn_or_action_key;
  }

  if (typeof fn_or_action_key !== 'string' || !fn_or_action_key) return null;

  const entry = normalize_action_entry(action_entry);
  if (!entry) return null;

  entry.menus = { ...(entry.menus || {}) };
  if (!Object.prototype.hasOwnProperty.call(entry.menus, menu_key)) {
    entry.menus[menu_key] = true;
  }

  env._registered_menu_action_entries ||= {};
  env._registered_menu_action_entries[menu_key] ||= {};
  env._registered_menu_action_entries[menu_key][fn_or_action_key] = entry;
  return entry;
}

/**
 * Build registered menu entries for a menu instance.
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

  run_legacy_builders(env, menu_key, menu, scope, params);

  collect_menu_entries(env, menu_key)
    .sort(compare_entries)
    .forEach((entry) => {
      build_menu_entry(create_menu_ctx(env, menu_key, menu, scope, params, entry));
    })
  ;

  return menu;
}

/**
 * Collect action entries that declare placement in the target menu.
 *
 * @param {object} env
 * @param {string} menu_key
 * @returns {Array<object>}
 */
export function collect_menu_entries(env, menu_key) {
  const entries = new Map();

  const add_entries = (source) => {
    Object.entries(source || {}).forEach(([action_key, action_entry]) => {
      const menu_spec = get_menu_spec(action_entry, menu_key);
      if (!menu_spec) return;
      entries.set(action_key, {
        action_key,
        action_entry,
        menu_spec,
      });
    });
  };

  add_entries(env?.config?.actions);
  add_entries(env?._registered_menu_action_entries?.[menu_key]);

  return Array.from(entries.values());
}

function run_legacy_builders(env, menu_key, menu, scope, params = {}) {
  const builders = env?._registered_menu_actions?.[menu_key];
  if (!builders) return;

  builders.forEach((builder) => {
    builder(menu, scope, { env, menu_key, menu, scope, params });
  });
}

function build_menu_entry(menu_ctx) {
  const { menu_spec } = menu_ctx;
  if (!should_show(menu_ctx)) return;

  if (menu_spec.replace) remove_items(menu_ctx);

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
      return get_action(scope?.actions, entry.action_key)
        || get_action(env?.actions, entry.action_key)
        || get_fallback_action(menu_ctx)
      ;
    },
    async run(run_params = {}) {
      const action = this.resolve_action();
      if (typeof action !== 'function') return false;

      const spec_params = resolve_params(menu_spec.params, menu_ctx);
      return await action({
        ...params,
        ...spec_params,
        ...run_params,
        menu_ctx,
        menu_key,
        action_key: entry.action_key,
        event_source: run_params.event_source || menu_spec.event_source || menu_ctx.event_source,
      });
    },
  };

  return menu_ctx;
}

function add_item(menu_ctx) {
  if (typeof menu_ctx.menu?.addItem !== 'function') return;

  const title = get_title(menu_ctx);
  const icon = get_value(menu_ctx.menu_spec.icon, menu_ctx)
    || menu_ctx.action_entry?.icon
    || menu_ctx.action_entry?.display_icon
    || ''
  ;
  const disabled = get_disabled(menu_ctx);
  const order = get_order(menu_ctx.menu_spec.order ?? menu_ctx.action_entry?.order);

  menu_ctx.menu.addItem((item) => {
    item._menu_key = menu_ctx.menu_key;
    item._action_key = menu_ctx.action_key;
    item._order = order;

    if (title) item.setTitle?.(title);
    if (icon) item.setIcon?.(icon);
    item.setDisabled?.(disabled);
    item.onClick?.(async (event, ...click_args) => {
      if (disabled) return false;
      return await menu_ctx.run({ click_event: event, click_args });
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
  item._order = get_order(menu_ctx.menu_spec.order ?? menu_ctx.action_entry?.order);
}

function remove_items(menu_ctx) {
  const items = menu_ctx.items;
  if (!items.length) return;

  const replace = menu_ctx.menu_spec.replace;
  const title = get_title(menu_ctx);
  const should_remove = typeof replace === 'function'
    ? (item, index) => Boolean(replace.call(menu_ctx, item, index, menu_ctx))
    : (item) => {
      if (replace === true) return item._action_key === menu_ctx.action_key || get_item_title(item) === title;
      if (typeof replace === 'string') return item._action_key === replace || get_item_title(item) === replace;
      return false;
    }
  ;

  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (!should_remove(items[i], i)) continue;
    items[i]?.itemEl?.remove?.();
    items.splice(i, 1);
  }
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

function get_menu_spec(action_entry, menu_key) {
  const menus = action_entry?.menus || action_entry?.action?.menus;
  if (!menus || !Object.prototype.hasOwnProperty.call(menus, menu_key)) return null;
  return normalize_menu_spec(menus[menu_key]);
}

function normalize_menu_spec(menu_spec) {
  if (menu_spec === false || menu_spec === null || typeof menu_spec === 'undefined') return null;
  if (menu_spec === true) return {};
  if (typeof menu_spec === 'function') return { build: menu_spec };
  if (is_object(menu_spec)) return menu_spec;
  return {};
}

function normalize_action_entry(action_entry) {
  if (typeof action_entry === 'function') return { action: action_entry };
  if (is_object(action_entry)) return { ...action_entry };
  return null;
}

function get_action(actions, action_key) {
  const action = actions?.[action_key];
  return typeof action === 'function' ? action : null;
}

function get_fallback_action(menu_ctx) {
  const entry = menu_ctx.action_entry;
  if (typeof entry === 'function') return entry.bind(menu_ctx);
  if (typeof entry?.action === 'function') return entry.action.bind(menu_ctx);
  return null;
}

function get_value(value, menu_ctx) {
  return typeof value === 'function' ? value.call(menu_ctx, menu_ctx) : value;
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
  const order_delta = get_order(left.menu_spec.order ?? left.action_entry?.order)
    - get_order(right.menu_spec.order ?? right.action_entry?.order)
  ;
  if (order_delta) return order_delta;
  return left.action_key.localeCompare(right.action_key);
}

function get_item_title(item) {
  return String(item?.title || item?.titleEl?.textContent || item?.itemEl?.textContent || '').trim();
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
