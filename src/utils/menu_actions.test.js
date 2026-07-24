import test from 'ava';
import {
  build_menu,
  resolve_menu_actions,
} from './menu_actions.js';

function without_run(actions = []) {
  return actions.map(({ run: _run, ...action }) => action);
}

function create_menu() {
  return {
    items: [],
    addItem(callback) {
      const item = {
        title: '',
        icon: '',
        disabled: false,
        setTitle(title) {
          this.title = title;
          return this;
        },
        setIcon(icon) {
          this.icon = icon;
          return this;
        },
        setDisabled(disabled) {
          this.disabled = Boolean(disabled);
          return this;
        },
        onClick(on_click) {
          this.on_click = on_click;
          return this;
        },
      };
      this.items.push(item);
      callback(item);
      return this;
    },
    addSeparator() {
      this.items.push({ separator: true });
      return this;
    },
  };
}

test('resolve_menu_actions returns visible action metadata in menu order', (t) => {
  const env = {
    config: {
      actions: {
        second_action: {
          action() {},
          menus: {
            'test:menu': {
              title() {
                return `Second ${this.params.suffix}`;
              },
              icon() {
                return this.scope.icon;
              },
              order: 20,
              disabled() {
                return this.params.disable_second === true;
              },
            },
          },
        },
        first_action: {
          action() {},
          menus: {
            'test:menu': {
              title: 'First',
              icon: 'copy',
              order: 10,
            },
          },
        },
        hidden_action: {
          action() {},
          menus: {
            'test:menu': {
              title: 'Hidden',
              when() {
                return false;
              },
            },
          },
        },
        separator_action: {
          action() {},
          menus: {
            'test:menu': {
              separator: true,
              order: 15,
            },
          },
        },
      },
    },
  };
  const scope = {
    env,
    icon: 'sparkles',
  };

  const actions = resolve_menu_actions(env, 'test:menu', scope, {
    suffix: 'action',
    disable_second: true,
  });

  t.deepEqual(without_run(actions), [
    {
      action_key: 'first_action',
      title: 'First',
      icon: 'copy',
      disabled: false,
      order: 10,
      menu_only: false,
      event_source: 'menu:test:menu:first_action',
    },
    {
      action_key: 'second_action',
      title: 'Second action',
      icon: 'sparkles',
      disabled: true,
      order: 20,
      menu_only: false,
      event_source: 'menu:test:menu:second_action',
    },
  ]);
});

test('resolve_menu_actions does not execute custom menu builders', (t) => {
  let build_call_ct = 0;
  const env = {
    config: {
      actions: {
        submenu_action: {
          action() {},
          menus: {
            'test:menu': {
              title: 'Submenu',
              order: 10,
              build() {
                build_call_ct += 1;
              },
            },
          },
        },
      },
    },
  };
  const scope = { env };

  const actions = resolve_menu_actions(env, 'test:menu', scope);

  t.is(build_call_ct, 0);
  t.is(actions.length, 1);
  t.true(actions[0].menu_only);

  build_menu(env, 'test:menu', create_menu(), scope);
  t.is(build_call_ct, 1);
});

test('resolved action run forwards only semantic params', async (t) => {
  let action_this = null;
  let action_params = null;
  const base_event = { type: 'contextmenu' };
  const explicit_click_event = { type: 'click' };
  const env = {
    config: {
      actions: {
        runnable_action: {
          action(params = {}) {
            action_this = this;
            action_params = params;
            return 'ran';
          },
          menus: {
            'test:menu': {
              title: 'Run action',
              params() {
                return {
                  from_spec: this.params.from_build,
                  menu_ctx: 'spec menu context',
                };
              },
            },
          },
        },
      },
    },
  };
  const scope = {
    env,
    marker: 'natural scope',
  };
  env.actions = {
    runnable_action() {
      t.fail('Menu execution must not use env.actions.');
    },
  };

  const [action] = resolve_menu_actions(env, 'test:menu', scope, {
    from_build: 'build',
    event: base_event,
    click_event: base_event,
    click_args: ['base click arg'],
    menu_key: 'base menu key',
    action_key: 'base action key',
    event_source: 'base source',
  });
  const result = await action.run({
    from_run: 'run',
    click_event: explicit_click_event,
    menu_ctx: 'run menu context',
    event_source: 'test.direct',
  });

  t.is(result, 'ran');
  t.is(action_this, scope);
  t.is(action_params.from_build, 'build');
  t.is(action_params.from_spec, 'build');
  t.is(action_params.from_run, 'run');
  t.is(action_params.click_event, explicit_click_event);
  t.is(
    action_params.event_source,
    'menu:test:menu:runnable_action',
  );
  t.false(Object.hasOwn(action_params, 'event'));
  t.false(Object.hasOwn(action_params, 'click_args'));
  t.false(Object.hasOwn(action_params, 'menu_ctx'));
  t.false(Object.hasOwn(action_params, 'menu_key'));
  t.false(Object.hasOwn(action_params, 'action_key'));
});

test('native click events require explicit placement selection', async (t) => {
  const calls = [];
  const base_event = { type: 'contextmenu' };
  const env = {
    config: {
      actions: {
        plain_action: {
          action(params = {}) {
            calls.push({
              action_key: 'plain_action',
              params,
            });
            return true;
          },
          menus: {
            'test:menu': true,
          },
        },
        event_action: {
          action(params = {}) {
            calls.push({
              action_key: 'event_action',
              params,
            });
            return true;
          },
          menus: {
            'test:menu': {
              params(_menu_ctx, event) {
                t.is(this.params.event, base_event);
                return { event };
              },
            },
          },
        },
      },
    },
  };
  const menu = create_menu();
  const event = { type: 'click' };

  build_menu(env, 'test:menu', menu, { env }, {
    event: base_event,
  });
  await menu.items[0].on_click(event, 'ignored');
  await menu.items[1].on_click(event, 'ignored');

  t.deepEqual(calls, [
    {
      action_key: 'event_action',
      params: {
        event,
        event_source: 'menu:test:menu:event_action',
      },
    },
    {
      action_key: 'plain_action',
      params: {
        event_source: 'menu:test:menu:plain_action',
      },
    },
  ]);
});

test('resolved disabled action fails closed without executing', async (t) => {
  let action_call_ct = 0;
  const env = {
    config: {
      actions: {
        disabled_action: {
          action() {
            action_call_ct += 1;
          },
          menus: {
            'test:menu': {
              disabled: true,
            },
          },
        },
      },
    },
  };
  const scope = { env };

  const [action] = resolve_menu_actions(env, 'test:menu', scope);
  const result = await action.run();

  t.false(result);
  t.is(action_call_ct, 0);
});

test('build_menu and resolve_menu_actions share presentation metadata', (t) => {
  const env = {
    config: {
      actions: {
        shared_action: {
          action() {},
          menus: {
            'test:menu': {
              title: 'Shared title',
              icon: 'shared-icon',
              order: 42,
              disabled: true,
            },
          },
        },
      },
    },
  };
  const menu = create_menu();
  const scope = { env };

  build_menu(env, 'test:menu', menu, scope);
  const [resolved] = resolve_menu_actions(env, 'test:menu', scope);
  const [built] = menu.items;

  t.is(built._action_key, resolved.action_key);
  t.is(built.title, resolved.title);
  t.is(built.icon, resolved.icon);
  t.is(built.disabled, resolved.disabled);
  t.is(built._order, resolved.order);
});

test('menu discovery validates each declared action scope', (t) => {
  const env = {
    config: {
      actions: {
        item_action: {
          action() {},
          action_scope: {
            type: 'item',
            collection_key: 'smart_sources',
            item_arg: 'source_key',
          },
          menus: {
            'test:menu': true,
          },
        },
        env_action: {
          action() {},
          action_scope: {
            type: 'env',
          },
          menus: {
            'test:menu': true,
          },
        },
      },
    },
  };
  env.smart_sources = {
    env,
  };
  const scope = {
    env,
    collection: env.smart_sources,
  };

  t.deepEqual(
    resolve_menu_actions(env, 'test:menu', scope)
      .map(({ action_key }) => action_key),
    ['item_action'],
  );
});

test('menu discovery rejects a foreign natural scope', (t) => {
  const env = {
    config: {
      actions: {
        foreign_action: {
          action() {},
          menus: {
            'test:menu': true,
          },
        },
      },
    },
  };
  const foreign_scope = {
    env: {
      config: {
        actions: {},
      },
    },
  };
  const menu = create_menu();

  t.deepEqual(
    resolve_menu_actions(env, 'test:menu', foreign_scope),
    [],
  );
  t.is(build_menu(env, 'test:menu', menu, foreign_scope), menu);
  t.is(menu.items.length, 0);
});

test('menu discovery rejects unsupported placement values', (t) => {
  const env = {
    config: {
      actions: {
        invalid_action: {
          action() {},
          menus: {
            'test:menu': 'invalid',
          },
        },
      },
    },
  };

  t.throws(
    () => resolve_menu_actions(env, 'test:menu', { env }),
    {
      message: 'Invalid menu specification.',
    },
  );
});
