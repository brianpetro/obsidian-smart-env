export function register_command_actions(plugin) {
  const { env, app } = plugin;
  const actions = env?.config?.actions;

  if (!is_object(actions)) {
    throw new Error(
      'Command actions require converged env.config.actions.',
    );
  }

  const candidates = [];
  const command_actions = new Map();

  for (const [action_key, action_entry] of Object.entries(actions)) {
    const commands = action_entry?.commands;
    if (typeof commands === 'undefined') continue;
    if (!is_object(commands)) {
      throw new TypeError(
        `Invalid commands export for action: ${action_key}`,
      );
    }

    for (const [command_id, command_spec] of Object.entries(commands)) {
      if (!command_id.trim() || !is_object(command_spec)) {
        throw new TypeError(`Invalid command spec: ${command_id}`);
      }
      if (typeof command_spec.register_when !== 'function') {
        throw new TypeError(
          `Command register_when must be a function: ${command_id}`,
        );
      }

      const should_register = command_spec.register_when({
        plugin,
        env,
        app,
        action_key,
        command_id,
      });
      assert_synchronous(
        should_register,
        `Command register_when must be synchronous: ${command_id}`,
      );
      if (!should_register) continue;

      const candidate = normalize_command({
        action_key,
        action_entry,
        command_id,
        command_spec,
      });
      const duplicate_action_key = command_actions.get(command_id);
      if (duplicate_action_key) {
        throw new Error(
          `Duplicate command '${command_id}' for actions `
          + `'${duplicate_action_key}' and '${action_key}' `
          + `in plugin '${plugin.manifest.id}'.`,
        );
      }

      command_actions.set(command_id, action_key);
      candidates.push(candidate);
    }
  }

  plugin._registered_command_actions ||= new Map();
  const registered_commands = plugin._registered_command_actions;

  for (const { action_key, command_id } of candidates) {
    const registered_action_key = registered_commands.get(command_id);
    if (
      registered_action_key
      && registered_action_key !== action_key
    ) {
      throw new Error(
        `Command '${command_id}' is already registered by action `
        + `'${registered_action_key}' in plugin '${plugin.manifest.id}'.`,
      );
    }
  }

  for (const candidate of candidates) {
    const {
      action_key,
      command_id,
      command_spec,
      context,
      name,
      hotkeys,
    } = candidate;

    if (registered_commands.get(command_id) === action_key) continue;

    const run_command = create_command_callback({
      plugin,
      action_key,
      command_id,
      command_spec,
    });
    const command = {
      id: command_id,
      name,
      ...(hotkeys ? { hotkeys } : {}),
    };

    if (context === 'editor') {
      Object.assign(command, {
        editorCheckCallback(
          checking,
          editor,
          editor_ctx,
        ) {
          return run_command({
            checking,
            editor,
            editor_ctx,
          });
        },
      });
    } else {
      Object.assign(command, {
        checkCallback(checking) {
          return run_command({
            checking,
            editor: undefined,
            editor_ctx: undefined,
          });
        },
      });
    }

    plugin.addCommand(command);
    registered_commands.set(command_id, action_key);
  }
}

export function get_scope_env(scope) {
  if (!scope || typeof scope !== 'object') {
    throw new TypeError('Action scope must be an object.');
  }

  const env = 'env' in scope
    ? scope.env
    : scope;

  if (!env || typeof env !== 'object' || !env.config?.actions) {
    throw new TypeError(
      'Action scope must be a SmartEnv or expose one through scope.env.',
    );
  }

  return env;
}

/**
 * @param {object} scope
 * @param {string} action_key
 * @param {object} [params]
 * @param {{event_source?: string}} [options]
 * @returns {Promise<*>}
 */
export async function run_action_entry(
  scope,
  action_key,
  params = {},
  options = {},
) {
  const { event_source } = options;
  if (!is_object(params)) {
    throw new TypeError('Action params must be an object.');
  }

  const env = get_scope_env(scope);
  const action_entry = env.config.actions[action_key];
  if (!action_entry) {
    throw new Error(`Action not found: ${action_key}`);
  }

  const scoped_action = scope.actions?.[action_key];
  const action = typeof scoped_action === 'function'
    ? scoped_action
    : action_entry.action?.bind(scope);

  if (typeof action !== 'function') {
    throw new Error(`Action is not callable: ${action_key}`);
  }

  return await action({
    ...params,
    ...(typeof event_source === 'undefined'
      ? {}
      : { event_source }),
  });
}

function create_command_callback({
  plugin,
  action_key,
  command_id,
  command_spec,
}) {
  const { env, app } = plugin;

  return ({ checking, editor, editor_ctx }) => {
    const command_ctx = {
      plugin,
      env,
      app,
      action_key,
      command_id,
      checking: Boolean(checking),
      editor,
      editor_ctx,
    };

    try {
      const params = resolve_params(command_spec, command_ctx);
      const scope = command_spec.get_scope
        ? command_spec.get_scope({ ...command_ctx, params })
        : env;
      assert_synchronous(
        scope,
        `Command get_scope must be synchronous: ${command_id}`,
      );
      if (!scope || get_scope_env(scope) !== env) return false;

      const available = command_spec.when
        ? command_spec.when({ ...command_ctx, params, scope })
        : true;
      assert_synchronous(
        available,
        `Command when must be synchronous: ${command_id}`,
      );
      if (!available) return false;
      if (checking) return true;

      void run_action_entry(scope, action_key, params, {
        event_source: `command:${plugin.manifest.id}:${command_id}`,
      }).catch((error) => {
        console.error(`Command action failed: ${command_id}`, error);
      });

      return true;
    } catch (error) {
      if (!checking) {
        console.error(
          `Command action unavailable: ${command_id}`,
          error,
        );
      }
      return false;
    }
  };
}

function resolve_params(command_spec, command_ctx) {
  const params = typeof command_spec.params === 'function'
    ? command_spec.params(command_ctx)
    : command_spec.params ?? {};
  assert_synchronous(
    params,
    `Command params must be synchronous: ${command_ctx.command_id}`,
  );
  if (!is_object(params)) {
    throw new TypeError(
      `Command params must be an object: ${command_ctx.command_id}`,
    );
  }
  return params;
}

function normalize_command({
  action_key,
  action_entry,
  command_id,
  command_spec,
}) {
  const context = command_spec.context ?? 'app';
  const name = command_spec.name
    || action_entry.display_name
    || humanize(action_key);

  if (context !== 'app' && context !== 'editor') {
    throw new TypeError(`Invalid command context: ${command_id}`);
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError(`Invalid command name: ${command_id}`);
  }
  if (typeof action_entry.action !== 'function') {
    throw new TypeError(`Action is not callable: ${action_key}`);
  }
  if (
    typeof command_spec.params !== 'undefined'
    && typeof command_spec.params !== 'function'
    && !is_object(command_spec.params)
  ) {
    throw new TypeError(`Invalid command params: ${command_id}`);
  }
  if (
    typeof command_spec.get_scope !== 'undefined'
    && typeof command_spec.get_scope !== 'function'
  ) {
    throw new TypeError(`Invalid command get_scope: ${command_id}`);
  }
  if (
    typeof command_spec.when !== 'undefined'
    && typeof command_spec.when !== 'function'
  ) {
    throw new TypeError(`Invalid command when: ${command_id}`);
  }
  if (
    typeof command_spec.hotkeys !== 'undefined'
    && !Array.isArray(command_spec.hotkeys)
  ) {
    throw new TypeError(`Invalid command hotkeys: ${command_id}`);
  }

  return {
    action_key,
    command_id,
    command_spec,
    context,
    name,
    hotkeys: command_spec.hotkeys,
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
