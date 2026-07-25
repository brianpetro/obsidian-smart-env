import fs from 'fs';
import { fileURLToPath } from 'url';
import test from 'ava';
import {
  register_command_actions,
} from '../../utils/command_actions.js';
import {
  commands as browse_commands,
  env_browse_smart_plugins,
} from './browse_smart_plugins.js';
import {
  commands as status_commands,
  env_open_status_view,
} from './open_status_view.js';

function create_env() {
  const emitted_events = [];
  const opened_status_views = [];
  const env = {
    config: {
      actions: {
        env_browse_smart_plugins: {
          action: env_browse_smart_plugins,
          commands: browse_commands,
        },
        env_open_status_view: {
          action: env_open_status_view,
          commands: status_commands,
        },
      },
    },

    events: {
      emit(event_key, params) {
        emitted_events.push({ event_key, params });
      },
    },

    open_env_status_view(params) {
      opened_status_views.push(params);
    },
  };

  return {
    emitted_events,
    env,
    opened_status_views,
  };
}

function create_plugin(env, manifest_id = 'smart-context') {
  const registered_commands = [];
  const plugin = {
    app: {
      workspace: {},
    },
    env,
    manifest: {
      id: manifest_id,
    },
    addCommand(command) {
      registered_commands.push(command);
    },
  };

  return {
    plugin,
    registered_commands,
  };
}

test('environment commands register only for the primary plugin instance', (t) => {
  const { env } = create_env();
  const primary = create_plugin(env);
  const secondary = create_plugin(env);
  env.main = primary.plugin;

  register_command_actions(primary.plugin);
  register_command_actions(secondary.plugin);

  t.deepEqual(
    primary.registered_commands.map(({ id }) => id).sort(),
    [
      'browse-smart-plugins',
      'env-status-view',
    ],
  );
  t.is(secondary.registered_commands.length, 0);
});

test('environment commands invoke the configured actions with connector event sources', (t) => {
  const {
    emitted_events,
    env,
    opened_status_views,
  } = create_env();
  const { plugin, registered_commands } = create_plugin(env);
  env.main = plugin;

  register_command_actions(plugin);

  const browse_command = registered_commands.find(
    ({ id }) => id === 'browse-smart-plugins',
  );
  const status_command = registered_commands.find(
    ({ id }) => id === 'env-status-view',
  );

  t.true(browse_command.checkCallback(true));
  t.true(status_command.checkCallback(true));
  t.is(emitted_events.length, 0);
  t.is(opened_status_views.length, 0);

  t.true(browse_command.checkCallback(false));
  t.true(status_command.checkCallback(false));

  t.deepEqual(emitted_events, [
    {
      event_key: 'smart_plugins:browse',
      params: {
        event_source: 'command:smart-context:browse-smart-plugins',
      },
    },
  ]);
  t.deepEqual(opened_status_views, [
    {
      event_source: 'command:smart-context:env-status-view',
    },
  ]);
});

test('SmartEnv delegates command registration and disables the implicit status-view command', (t) => {
  const smart_env_path = fileURLToPath(
    new URL('../../../smart_env.js', import.meta.url),
  );
  const config_path = fileURLToPath(
    new URL('../../../smart_env.config.js', import.meta.url),
  );
  const smart_env_source = fs.readFileSync(smart_env_path, 'utf8');
  const config_source = fs.readFileSync(config_path, 'utf8');

  t.true(smart_env_source.includes(
    'this.main?.register_command_actions?.();',
  ));
  t.true(smart_env_source.includes(
    'skip_command_registration: true',
  ));
  t.false(smart_env_source.includes(
    '_registered_browse_smart_plugins_command',
  ));
  t.false(smart_env_source.includes(
    '_registered_env_status_view_command',
  ));
  t.false(smart_env_source.includes("id: 'browse-smart-plugins'"));
  t.false(smart_env_source.includes("id: 'env-status-view'"));

  t.regex(
    config_source,
    /env_browse_smart_plugins: \{[^\n]*commands:/,
  );
  t.regex(
    config_source,
    /env_open_status_view: \{[^\n]*commands:/,
  );
});
