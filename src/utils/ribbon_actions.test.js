import test from 'ava';
import {
  register_ribbon_actions,
} from './ribbon_actions.js';

function create_plugin(actions, manifest_id = 'smart-context') {
  const registered_ribbons = [];
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

    addRibbonIcon(icon_name, description, callback) {
      registered_ribbons.push({
        icon_name,
        description,
        callback,
      });
    }
  }

  return {
    env,
    plugin: new TestPlugin(),
    registered_ribbons,
  };
}

function flush_promises() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('registers only ribbon icons applicable to the exact plugin instance', (t) => {
  let register_plugin = null;
  const {
    plugin,
    registered_ribbons,
  } = create_plugin({
    target_action: {
      action() {},
      display_name: 'Target action',
      ribbon_icons: {
        target: {
          icon_name: 'target-icon',
          register_when({ plugin: received_plugin }) {
            register_plugin = received_plugin;
            return received_plugin.manifest.id === 'smart-context';
          },
        },
      },
    },
    other_action: {
      action() {},
      ribbon_icons: {
        target: {
          icon_name: null,
          register_when({ plugin: received_plugin }) {
            return received_plugin.manifest.id === 'other-plugin';
          },
        },
      },
    },
  });

  register_ribbon_actions(plugin);

  t.is(register_plugin, plugin);
  t.is(registered_ribbons.length, 1);
  t.is(registered_ribbons[0].icon_name, 'target-icon');
  t.is(registered_ribbons[0].description, 'Target action');
  t.is(typeof registered_ribbons[0].callback, 'function');
});

test('rejects applicable duplicate ribbon IDs before registration', (t) => {
  const {
    plugin,
    registered_ribbons,
  } = create_plugin({
    first_action: {
      action() {},
      ribbon_icons: {
        duplicate: {
          icon_name: 'first-icon',
          description: 'First',
          register_when() {
            return true;
          },
        },
      },
    },
    second_action: {
      action() {},
      ribbon_icons: {
        duplicate: {
          icon_name: 'second-icon',
          description: 'Second',
          register_when() {
            return true;
          },
        },
      },
    },
  });

  t.throws(
    () => register_ribbon_actions(plugin),
    {
      message: /Duplicate ribbon icon 'duplicate'/,
    },
  );
  t.is(registered_ribbons.length, 0);
});

test('ribbon callback resolves scope and invokes the configured action', async (t) => {
  let action_call_ct = 0;
  let action_this = null;
  let action_params = null;
  let runtime_plugin = null;
  const click_event = {
    button: 0,
  };
  const {
    env,
    plugin,
    registered_ribbons,
  } = create_plugin({
    open_source: {
      action(params) {
        action_call_ct += 1;
        action_this = this;
        action_params = params;
      },
      ribbon_icons: {
        open_source: {
          icon_name: 'open-icon',
          description: 'Open source',
          register_when() {
            return true;
          },
          params({ plugin: received_plugin, click_event: received_event }) {
            t.is(received_plugin, plugin);
            t.is(received_event, click_event);
            return {
              event_source: 'placement-value',
            };
          },
          get_scope({ params }) {
            t.is(params.event_source, 'placement-value');
            return env;
          },
          when({ plugin: received_plugin, scope }) {
            runtime_plugin = received_plugin;
            return scope === env;
          },
        },
      },
    },
  });

  register_ribbon_actions(plugin);
  const [ribbon] = registered_ribbons;

  t.true(ribbon.callback(click_event));
  await flush_promises();

  t.is(runtime_plugin, plugin);
  t.is(action_call_ct, 1);
  t.is(action_this, env);
  t.is(
    action_params.event_source,
    'ribbon:smart-context:open_source',
  );
});

test('repeated registration does not duplicate ribbon icons', (t) => {
  const {
    plugin,
    registered_ribbons,
  } = create_plugin({
    stable_action: {
      action() {},
      ribbon_icons: {
        stable: {
          icon_name: 'stable-icon',
          description: 'Stable',
          register_when() {
            return true;
          },
        },
      },
    },
  });

  register_ribbon_actions(plugin);
  register_ribbon_actions(plugin);

  t.is(registered_ribbons.length, 1);
  t.is(
    plugin._registered_ribbon_actions.get('stable'),
    'stable_action',
  );
});
