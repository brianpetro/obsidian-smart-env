import test from 'ava';
import {
  register_command_actions,
} from './command_actions.js';

function create_plugin(actions, manifest_id = 'smart-context') {
  const registered_commands = [];
  const env = {
    config: {
      actions,
    },
  };

  class TestPlugin {
    app = {
      workspace: {},
    };

    env = env;

    manifest = {
      id: manifest_id,
    };

    addCommand(command) {
      registered_commands.push(command);
    }
  }

  return {
    env,
    plugin: new TestPlugin(),
    registered_commands,
  };
}

function flush_promises() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('registers only commands applicable to the exact plugin instance', (t) => {
  let register_plugin = null;
  const {
    plugin,
    registered_commands,
  } = create_plugin({
    target_action: {
      action() {},
      display_name: 'Target action',
      commands: {
        shared_command: {
          register_when({ plugin: received_plugin }) {
            register_plugin = received_plugin;
            return received_plugin.manifest.id === 'smart-context';
          },
        },
      },
    },
    other_action: {
      action() {},
      commands: {
        shared_command: {
          context: 'invalid-for-this-plugin',
          register_when({ plugin: received_plugin }) {
            return received_plugin.manifest.id === 'other-plugin';
          },
        },
      },
    },
  });

  register_command_actions(plugin);

  t.is(register_plugin, plugin);
  t.is(registered_commands.length, 1);
  t.is(registered_commands[0].id, 'shared_command');
  t.is(registered_commands[0].name, 'Target action');
  t.is(typeof registered_commands[0].checkCallback, 'function');
});

test('rejects applicable duplicate command IDs before registration', (t) => {
  const {
    plugin,
    registered_commands,
  } = create_plugin({
    first_action: {
      action() {},
      commands: {
        duplicate_command: {
          register_when() {
            return true;
          },
        },
      },
    },
    second_action: {
      action() {},
      commands: {
        duplicate_command: {
          register_when() {
            return true;
          },
        },
      },
    },
  });

  t.throws(
    () => register_command_actions(plugin),
    {
      message: /Duplicate command 'duplicate_command'/,
    },
  );
  t.is(registered_commands.length, 0);
});

test('app command checks availability and invokes the configured action', async (t) => {
  let action_call_ct = 0;
  let action_this = null;
  let action_params = null;
  let runtime_plugin = null;
  const {
    env,
    plugin,
    registered_commands,
  } = create_plugin({
    refresh_source: {
      action(params) {
        action_call_ct += 1;
        action_this = this;
        action_params = params;
      },
      commands: {
        refresh_source: {
          register_when() {
            return true;
          },
          params({ plugin: received_plugin }) {
            return {
              plugin_id: received_plugin.manifest.id,
              event_source: 'placement-value',
            };
          },
          when({ plugin: received_plugin, scope, params }) {
            runtime_plugin = received_plugin;
            return scope === env && params.plugin_id === 'smart-context';
          },
        },
      },
    },
  });

  register_command_actions(plugin);
  const [command] = registered_commands;

  t.true(command.checkCallback(true));
  t.is(action_call_ct, 0);
  t.is(runtime_plugin, plugin);

  t.true(command.checkCallback(false));
  await flush_promises();

  t.is(action_call_ct, 1);
  t.is(action_this, env);
  t.is(action_params.plugin_id, 'smart-context');
  t.is(
    action_params.event_source,
    'command:smart-context:refresh_source',
  );
});

test('editor command passes callback state and invokes the scoped action', async (t) => {
  const editor = {
    id: 'editor',
  };
  const editor_ctx = {
    file: {
      path: 'Current.md',
    },
  };
  let fallback_call_ct = 0;
  let scoped_action_this = null;
  let scoped_action_params = null;
  let scope = null;
  const {
    env,
    plugin,
    registered_commands,
  } = create_plugin({
    refresh_current_note: {
      action() {
        fallback_call_ct += 1;
      },
      commands: {
        refresh_current_note: {
          context: 'editor',
          register_when() {
            return true;
          },
          params(command_ctx) {
            t.is(command_ctx.plugin, plugin);
            t.is(command_ctx.editor, editor);
            t.is(command_ctx.editor_ctx, editor_ctx);
            return {
              source_key: command_ctx.editor_ctx.file.path,
            };
          },
          get_scope(command_ctx) {
            t.is(command_ctx.plugin, plugin);
            t.is(command_ctx.params.source_key, 'Current.md');
            return scope;
          },
          when(command_ctx) {
            t.is(command_ctx.plugin, plugin);
            t.is(command_ctx.scope, scope);
            return true;
          },
        },
      },
    },
  });

  scope = {
    env,
  };
  scope.actions = {
    refresh_current_note: function refresh_current_note(params) {
      scoped_action_this = this;
      scoped_action_params = params;
    }.bind(scope),
  };

  register_command_actions(plugin);
  const [command] = registered_commands;

  t.is(typeof command.editorCheckCallback, 'function');
  t.true(command.editorCheckCallback(true, editor, editor_ctx));
  t.is(scoped_action_params, null);

  t.true(command.editorCheckCallback(false, editor, editor_ctx));
  await flush_promises();

  t.is(fallback_call_ct, 0);
  t.is(scoped_action_this, scope);
  t.is(scoped_action_params.source_key, 'Current.md');
  t.is(
    scoped_action_params.event_source,
    'command:smart-context:refresh_current_note',
  );
});

test('repeated registration does not duplicate commands', (t) => {
  const {
    plugin,
    registered_commands,
  } = create_plugin({
    stable_action: {
      action() {},
      commands: {
        stable_command: {
          register_when() {
            return true;
          },
        },
      },
    },
  });

  register_command_actions(plugin);
  register_command_actions(plugin);

  t.is(registered_commands.length, 1);
  t.is(
    plugin._registered_command_actions.get('stable_command'),
    'stable_action',
  );
});
