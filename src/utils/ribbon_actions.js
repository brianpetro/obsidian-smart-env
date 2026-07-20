import {
  get_scope_env,
  run_action_entry,
} from './command_actions.js';

export function register_ribbon_actions(plugin) {
  const { env, app } = plugin;
  const actions = env?.config?.actions;

  if (!is_object(actions)) {
    throw new Error(
      'Ribbon actions require converged env.config.actions.',
    );
  }

  const candidates = [];
  const ribbon_actions = new Map();

  for (const [action_key, action_entry] of Object.entries(actions)) {
    const ribbon_icons = action_entry?.ribbon_icons;
    if (typeof ribbon_icons === 'undefined') continue;
    if (!is_object(ribbon_icons)) {
      throw new TypeError(
        `Invalid ribbon_icons export for action: ${action_key}`,
      );
    }

    for (const [ribbon_id, ribbon_spec] of Object.entries(ribbon_icons)) {
      if (!ribbon_id.trim() || !is_object(ribbon_spec)) {
        throw new TypeError(`Invalid ribbon icon spec: ${ribbon_id}`);
      }
      if (typeof ribbon_spec.register_when !== 'function') {
        throw new TypeError(
          `Ribbon register_when must be a function: ${ribbon_id}`,
        );
      }

      const should_register = ribbon_spec.register_when({
        plugin,
        env,
        app,
        action_key,
        ribbon_id,
      });
      assert_synchronous(
        should_register,
        `Ribbon register_when must be synchronous: ${ribbon_id}`,
      );
      if (!should_register) continue;

      const candidate = normalize_ribbon({
        action_key,
        action_entry,
        ribbon_id,
        ribbon_spec,
      });
      const duplicate_action_key = ribbon_actions.get(ribbon_id);
      if (duplicate_action_key) {
        throw new Error(
          `Duplicate ribbon icon '${ribbon_id}' for actions `
          + `'${duplicate_action_key}' and '${action_key}' `
          + `in plugin '${plugin.manifest.id}'.`,
        );
      }

      ribbon_actions.set(ribbon_id, action_key);
      candidates.push(candidate);
    }
  }

  plugin._registered_ribbon_actions ||= new Map();
  const registered_ribbons = plugin._registered_ribbon_actions;

  for (const { action_key, ribbon_id } of candidates) {
    const registered_action_key = registered_ribbons.get(ribbon_id);
    if (
      registered_action_key
      && registered_action_key !== action_key
    ) {
      throw new Error(
        `Ribbon icon '${ribbon_id}' is already registered by action `
        + `'${registered_action_key}' in plugin '${plugin.manifest.id}'.`,
      );
    }
  }

  for (const candidate of candidates) {
    const {
      action_key,
      ribbon_id,
      ribbon_spec,
      icon_name,
      description,
    } = candidate;

    if (registered_ribbons.get(ribbon_id) === action_key) continue;

    const callback = create_ribbon_callback({
      plugin,
      action_key,
      ribbon_id,
      ribbon_spec,
    });

    plugin.addRibbonIcon(
      icon_name,
      description,
      callback,
    );
    registered_ribbons.set(ribbon_id, action_key);
  }
}

function create_ribbon_callback({
  plugin,
  action_key,
  ribbon_id,
  ribbon_spec,
}) {
  const { env, app } = plugin;

  return (click_event) => {
    const ribbon_ctx = {
      plugin,
      env,
      app,
      action_key,
      ribbon_id,
      click_event,
    };

    try {
      const params = resolve_params(ribbon_spec, ribbon_ctx);
      const scope = ribbon_spec.get_scope
        ? ribbon_spec.get_scope({ ...ribbon_ctx, params })
        : env;
      assert_synchronous(
        scope,
        `Ribbon get_scope must be synchronous: ${ribbon_id}`,
      );
      if (!scope || get_scope_env(scope) !== env) return false;

      const available = ribbon_spec.when
        ? ribbon_spec.when({ ...ribbon_ctx, params, scope })
        : true;
      assert_synchronous(
        available,
        `Ribbon when must be synchronous: ${ribbon_id}`,
      );
      if (!available) return false;

      void run_action_entry(scope, action_key, params, {
        event_source: `ribbon:${plugin.manifest.id}:${ribbon_id}`,
      }).catch((error) => {
        console.error(`Ribbon action failed: ${ribbon_id}`, error);
      });

      return true;
    } catch (error) {
      console.error(
        `Ribbon action unavailable: ${ribbon_id}`,
        error,
      );
      return false;
    }
  };
}

function resolve_params(ribbon_spec, ribbon_ctx) {
  const params = typeof ribbon_spec.params === 'function'
    ? ribbon_spec.params(ribbon_ctx)
    : ribbon_spec.params ?? {};
  assert_synchronous(
    params,
    `Ribbon params must be synchronous: ${ribbon_ctx.ribbon_id}`,
  );
  if (!is_object(params)) {
    throw new TypeError(
      `Ribbon params must be an object: ${ribbon_ctx.ribbon_id}`,
    );
  }
  return params;
}

function normalize_ribbon({
  action_key,
  action_entry,
  ribbon_id,
  ribbon_spec,
}) {
  const { icon_name } = ribbon_spec;
  const description = ribbon_spec.description
    || action_entry.display_name
    || humanize(action_key);

  if (typeof icon_name !== 'string' || !icon_name.trim()) {
    throw new TypeError(`Invalid ribbon icon name: ${ribbon_id}`);
  }
  if (typeof description !== 'string' || !description.trim()) {
    throw new TypeError(`Invalid ribbon description: ${ribbon_id}`);
  }
  if (typeof action_entry.action !== 'function') {
    throw new TypeError(`Action is not callable: ${action_key}`);
  }
  if (
    typeof ribbon_spec.params !== 'undefined'
    && typeof ribbon_spec.params !== 'function'
    && !is_object(ribbon_spec.params)
  ) {
    throw new TypeError(`Invalid ribbon params: ${ribbon_id}`);
  }
  if (
    typeof ribbon_spec.get_scope !== 'undefined'
    && typeof ribbon_spec.get_scope !== 'function'
  ) {
    throw new TypeError(`Invalid ribbon get_scope: ${ribbon_id}`);
  }
  if (
    typeof ribbon_spec.when !== 'undefined'
    && typeof ribbon_spec.when !== 'function'
  ) {
    throw new TypeError(`Invalid ribbon when: ${ribbon_id}`);
  }

  return {
    action_key,
    ribbon_id,
    ribbon_spec,
    icon_name,
    description,
  };
}

function assert_synchronous(value, message) {
  if (value && typeof value.then === 'function') {
    throw new TypeError(message);
  }
}

function humanize(action_key = '') {
  return String(action_key)
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function is_object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
