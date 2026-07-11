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
  const scope = {
    icon: 'sparkles',
  };
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

  const actions = resolve_menu_actions(env, 'test:menu', {});

  t.is(build_call_ct, 0);
  t.is(actions.length, 1);
  t.true(actions[0].menu_only);

  build_menu(env, 'test:menu', create_menu(), {});
  t.is(build_call_ct, 1);
});

test('resolved action run preserves menu params and natural fallback scope', async (t) => {
  const scope = {
    marker: 'natural scope',
  };
  let action_this = null;
  let action_params = null;
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
                };
              },
            },
          },
        },
      },
    },
  };

  const [action] = resolve_menu_actions(env, 'test:menu', scope, {
    from_build: 'build',
  });
  const result = await action.run({
    from_run: 'run',
    event_source: 'test.direct',
  });

  t.is(result, 'ran');
  t.is(action_this, scope);
  t.is(action_params.from_build, 'build');
  t.is(action_params.from_spec, 'build');
  t.is(action_params.from_run, 'run');
  t.is(action_params.menu_key, 'test:menu');
  t.is(action_params.action_key, 'runnable_action');
  t.is(action_params.event_source, 'test.direct');
  t.is(action_params.menu_ctx.scope, scope);
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

  const [action] = resolve_menu_actions(env, 'test:menu', {});
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

  build_menu(env, 'test:menu', menu, {});
  const [resolved] = resolve_menu_actions(env, 'test:menu', {});
  const [built] = menu.items;

  t.is(built._action_key, resolved.action_key);
  t.is(built.title, resolved.title);
  t.is(built.icon, resolved.icon);
  t.is(built.disabled, resolved.disabled);
  t.is(built._order, resolved.order);
});
