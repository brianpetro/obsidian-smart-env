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

/** Minimal native-menu surface for testing hover lifecycle calls, not rendering. */
function create_hover_menu() {
  const menu = create_menu();
  const add_item = menu.addItem;
  const listeners = [];

  Object.assign(menu, {
    currentSubmenu: null,
    selected: -1,
    visible: false,
    calls: [],
    listeners,
    dom: {
      addEventListener(type, callback, capture) {
        listeners.push({ type, callback, capture });
      },
    },
    addItem(callback) {
      return add_item.call(this, (item) => {
        item.dom = {
          closest(selector) {
            return selector === '.menu-item' ? this : null;
          },
        };
        item.setSubmenu = () => {
          item.submenu = create_hover_menu();
          return item.submenu;
        };
        callback(item);
      });
    },
    closeSubmenu() {
      this.calls.push('close');
      if (this.currentSubmenu) {
        this.currentSubmenu.closeSubmenu();
        this.currentSubmenu.visible = false;
      }
      this.currentSubmenu = null;
    },
    select(index) {
      this.calls.push(['select', index]);
      this.selected = index;
    },
    openSubmenu(item) {
      this.calls.push(['open', item.title]);
      this.currentSubmenu = item.submenu;
      item.submenu.visible = true;
    },
  });

  return menu;
}

function create_hover_fixture() {
  const menu = create_hover_menu();
  const env = {
    config: {
      actions: {
        target_action: {
          action() {},
          menus: {
            'test:menu': {
              build() {
                this.menu.addItem((item) => {
                  item.setTitle('Change target');
                  const submenu = item.setSubmenu();
                  ['History', 'Blocks'].forEach((title) => {
                    submenu.addItem((child) => {
                      child.setTitle(title);
                      child.setSubmenu().addItem((leaf) => {
                        leaf.setTitle(`${title} target`);
                      });
                    });
                  });
                });
              },
            },
          },
        },
      },
    },
  };
  const scope = { env };
  build_menu(env, 'test:menu', menu, scope);
  const target_item = menu.items[0];
  const target_menu = target_item.submenu;
  const [history, blocks] = target_menu.items;

  return { env, scope, menu, target_item, target_menu, history, blocks };
}

function dispatch_menu_hover(menu, target, type = 'mouseover') {
  const event = { target };
  menu.listeners
    .filter((listener) => listener.type === type)
    .forEach((listener) => listener.callback(event))
  ;
}

function set_open_submenu(menu, item) {
  menu.selected = menu.items.indexOf(item);
  menu.currentSubmenu = item.submenu;
  item.submenu.visible = true;
}

test('adjacent submenus switch in both directions without reopening the parent', (t) => {
  const { menu, target_item, target_menu, history, blocks } = create_hover_fixture();
  set_open_submenu(menu, target_item);
  set_open_submenu(target_menu, history);

  for (const [previous, next] of [[history, blocks], [blocks, history], [history, blocks]]) {
    target_menu.calls.length = 0;
    dispatch_menu_hover(target_menu, next.dom);

    t.is(target_menu.currentSubmenu, next.submenu);
    t.false(previous.submenu.visible);
    t.true(next.submenu.visible);
    t.is(target_menu.selected, target_menu.items.indexOf(next));
    t.deepEqual(target_menu.calls, [
      'close',
      ['select', target_menu.items.indexOf(next)],
      ['open', next.title],
    ]);
    t.is(menu.currentSubmenu, target_menu);
    t.true(target_menu.visible);
  }
});

test('pointerover followed by mouseover switches a submenu only once', (t) => {
  const { target_menu, history, blocks } = create_hover_fixture();
  set_open_submenu(target_menu, history);
  const icon = { closest: () => blocks.dom };

  dispatch_menu_hover(target_menu, icon, 'pointerover');
  dispatch_menu_hover(target_menu, icon, 'mouseover');

  t.is(target_menu.currentSubmenu, blocks.submenu);
  t.deepEqual(target_menu.calls, ['close', ['select', 1], ['open', 'Blocks']]);
  t.true(target_menu.listeners.every((listener) => listener.capture === true));
});

test('first-open timing and hovering the already-open item remain native', (t) => {
  const { target_menu, history } = create_hover_fixture();

  dispatch_menu_hover(target_menu, history.dom);
  t.deepEqual(target_menu.calls, []);
  t.is(target_menu.currentSubmenu, null);

  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, history.dom);
  t.deepEqual(target_menu.calls, []);
  t.is(target_menu.currentSubmenu, history.submenu);
});

test('nested hover events leave ancestor selections and child clicks intact', async (t) => {
  const { menu, target_item, target_menu, history, blocks } = create_hover_fixture();
  set_open_submenu(menu, target_item);
  set_open_submenu(target_menu, history);

  // Capture reaches ancestors first, but only the row's own menu should switch.
  dispatch_menu_hover(menu, blocks.dom, 'pointerover');
  dispatch_menu_hover(target_menu, blocks.dom, 'pointerover');
  const leaf = blocks.submenu.items[0];
  dispatch_menu_hover(menu, leaf.dom);
  dispatch_menu_hover(target_menu, leaf.dom);
  dispatch_menu_hover(blocks.submenu, leaf.dom);

  let click_count = 0;
  leaf.onClick(() => { click_count += 1; });
  await leaf.on_click();

  t.deepEqual(menu.calls, []);
  t.is(menu.currentSubmenu, target_menu);
  t.is(menu.selected, 0);
  t.is(target_menu.currentSubmenu, blocks.submenu);
  t.is(target_menu.selected, 1);
  t.is(click_count, 1);
});

test('disabled adjacent submenu items do not override native handling', (t) => {
  const { target_menu, history, blocks } = create_hover_fixture();
  set_open_submenu(target_menu, history);
  blocks.setDisabled(true);

  dispatch_menu_hover(target_menu, blocks.dom, 'pointerover');
  dispatch_menu_hover(target_menu, blocks.dom);

  t.deepEqual(target_menu.calls, []);
  t.is(target_menu.currentSubmenu, history.submenu);
  t.false(blocks.submenu.visible);
});

test('hovering an ordinary sibling closes the old child without opening a menu', (t) => {
  const { target_menu, history } = create_hover_fixture();
  target_menu.addItem((item) => item.setTitle('Refresh'));
  set_open_submenu(target_menu, history);

  dispatch_menu_hover(target_menu, target_menu.items[2].dom);

  t.deepEqual(target_menu.calls, ['close', ['select', 2]]);
  t.is(target_menu.currentSubmenu, null);
  t.false(history.submenu.visible);
});

test('padding, separators, and unrelated rows do not close an open submenu', (t) => {
  const { target_menu, history } = create_hover_fixture();
  target_menu.addSeparator();
  set_open_submenu(target_menu, history);

  for (const target of [null, {}, { closest: () => null }, { closest: () => ({}) }]) {
    dispatch_menu_hover(target_menu, target);
  }

  t.deepEqual(target_menu.calls, []);
  t.is(target_menu.currentSubmenu, history.submenu);
});

test('composed builds bind new child menus without duplicating existing handlers', (t) => {
  const { env, scope, menu, target_menu } = create_hover_fixture();
  env.config.actions.more_action = {
    action() {},
    menus: {
      'test:more': {
        build() {
          this.menu.addItem((item) => {
            const submenu = item.setSubmenu();
            submenu.addItem((child) => child.setSubmenu());
          });
        },
      },
    },
  };

  build_menu(env, 'test:more', menu, scope);
  build_menu(env, 'test:more', menu, scope);

  t.is(menu.listeners.length, 2);
  t.is(target_menu.listeners.length, 2);
  t.is(menu.items[1].submenu.listeners.length, 2);
  t.is(menu.items[2].submenu.listeners.length, 2);
  t.is(target_menu.items[0].submenu.listeners.length, 0);
});

test('closing a branch closes its descendants and allows the branch to reopen', (t) => {
  const { menu, target_item, target_menu, history, blocks } = create_hover_fixture();
  menu.addItem((item) => {
    item.setTitle('Other');
    item.setSubmenu().addItem((child) => child.setTitle('Other action'));
  });
  const other = menu.items[1];
  set_open_submenu(menu, target_item);
  set_open_submenu(target_menu, history);

  dispatch_menu_hover(menu, other.dom);
  t.false(target_menu.visible);
  t.false(history.submenu.visible);
  t.is(target_menu.currentSubmenu, null);

  dispatch_menu_hover(menu, target_item.dom);
  t.true(target_menu.visible);
  t.false(other.submenu.visible);
  // The first child still opens natively after re-entering its parent.
  set_open_submenu(target_menu, blocks);
  dispatch_menu_hover(target_menu, history.dom);
  t.is(target_menu.currentSubmenu, history.submenu);
  t.false(blocks.submenu.visible);
});

test('hosts without the required native menu capabilities are left untouched', (t) => {
  for (const capability of ['dom', 'closeSubmenu', 'select', 'openSubmenu']) {
    const { env, scope } = create_hover_fixture();
    const menu = create_hover_menu();
    delete menu[capability];

    t.notThrows(() => build_menu(env, 'test:menu', menu, scope));
    t.is(menu.listeners.length, 0);
    t.is(menu.items[0].submenu.listeners.length, 2);
  }
});

test('foreign scopes do not attach handlers to an existing menu', (t) => {
  const { env } = create_hover_fixture();
  const menu = create_hover_menu();
  menu.addItem((item) => item.setSubmenu());

  build_menu(env, 'test:menu', menu, { env: { config: { actions: {} } } });

  t.is(menu.listeners.length, 0);
  t.is(menu.items.length, 1);
});
