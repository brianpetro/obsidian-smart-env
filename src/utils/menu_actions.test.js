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

/** Event targets and a per-window clock keep hover tests deterministic. */
function create_hover_event_target() {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, callback, capture = false) {
      if (listeners.some((listener) => {
        return listener.type === type
          && listener.callback === callback
          && listener.capture === capture;
      })) return;
      listeners.push({ type, callback, capture });
    },
    removeEventListener(type, callback, capture = false) {
      const index = listeners.findIndex((listener) => {
        return listener.type === type
          && listener.callback === callback
          && listener.capture === capture;
      });
      if (index >= 0) listeners.splice(index, 1);
    },
    dispatch(type, target = this, params = {}) {
      const event = {
        type,
        target,
        defaultPrevented: false,
        propagation_stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagation_stopped = true; },
        stopImmediatePropagation() { this.propagation_stopped = true; },
        ...params,
      };
      listeners.slice()
        .filter((listener) => listener.type === type)
        .forEach((listener) => listener.callback(event))
      ;
      return event;
    },
  };
}

function create_hover_document() {
  const owner_document = create_hover_event_target();
  const owner_window = create_hover_event_target();
  const timers = new Map();
  let now = 0;
  let next_id = 0;

  Object.assign(owner_window, {
    setTimeout(callback, delay) {
      const id = next_id++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    tick(duration) {
      const until = now + duration;
      while (timers.size) {
        const [id, timer] = Array.from(timers.entries())
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (timer.at > until) break;
        now = timer.at;
        timers.delete(id);
        timer.callback();
      }
      now = until;
    },
  });
  Object.defineProperty(owner_window, 'pending_count', {
    get: () => timers.size,
  });
  owner_document.defaultView = owner_window;
  return owner_document;
}

/** Minimal native-menu surface for testing hover lifecycle calls, not rendering. */
function create_hover_menu(owner_document = create_hover_document()) {
  const menu = create_menu();
  const add_item = menu.addItem;
  const dom = create_hover_event_target();
  const listeners = dom.listeners;
  const hide_callbacks = [];
  dom.ownerDocument = owner_document;
  dom.isConnected = false;

  Object.assign(menu, {
    currentSubmenu: null,
    selected: -1,
    visible: false,
    calls: [],
    listeners,
    hide_callbacks,
    dom,
    onHide(callback) {
      hide_callbacks.push(callback);
    },
    hide() {
      this.closeSubmenu();
      this.visible = false;
      this.dom.isConnected = false;
      hide_callbacks.forEach((callback) => callback());
      return this;
    },
    addItem(callback) {
      return add_item.call(this, (item) => {
        item.dom = {
          closest(selector) {
            return selector === '.menu-item' ? this : null;
          },
        };
        item.setSubmenu = () => {
          item.submenu = create_hover_menu(owner_document);
          return item.submenu;
        };
        callback(item);
      });
    },
    closeSubmenu() {
      this.calls.push('close');
      if (this.currentSubmenu) {
        this.currentSubmenu.hide();
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
      item.submenu.dom.isConnected = true;
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

  const owner_document = menu.dom.ownerDocument;
  const clock = owner_document.defaultView;
  return { env, scope, menu, target_item, target_menu, history, blocks, owner_document, clock };
}

function dispatch_menu_hover(menu, target, type = 'mouseover') {
  return menu.dom.dispatch(type, target);
}

function set_open_submenu(menu, item) {
  menu.visible = true;
  menu.dom.isConnected = true;
  menu.selected = menu.items.indexOf(item);
  menu.currentSubmenu = item.submenu;
  item.submenu.visible = true;
  item.submenu.dom.isConnected = true;
}

test('adjacent submenus switch in both directions without reopening the parent', (t) => {
  const { menu, target_item, target_menu, history, blocks, clock } = create_hover_fixture();
  set_open_submenu(menu, target_item);
  set_open_submenu(target_menu, history);

  for (const [previous, next] of [[history, blocks], [blocks, history], [history, blocks]]) {
    target_menu.calls.length = 0;
    dispatch_menu_hover(target_menu, next.dom);
    clock.tick(249);
    t.is(target_menu.currentSubmenu, previous.submenu);
    t.deepEqual(target_menu.calls, []);
    clock.tick(1);

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
  const { target_menu, history, blocks, clock } = create_hover_fixture();
  set_open_submenu(target_menu, history);
  const icon = { closest: () => blocks.dom };

  dispatch_menu_hover(target_menu, icon, 'pointerover');
  clock.tick(100);
  dispatch_menu_hover(target_menu, icon, 'mouseover');
  t.is(clock.pending_count, 1);
  clock.tick(149);
  t.is(target_menu.currentSubmenu, history.submenu);
  clock.tick(1);

  t.is(target_menu.currentSubmenu, blocks.submenu);
  t.deepEqual(target_menu.calls, ['close', ['select', 1], ['open', 'Blocks']]);
  t.true(target_menu.listeners
    .filter((listener) => listener.type.endsWith('over'))
    .every((listener) => listener.capture === true));
  t.is(clock.pending_count, 0);
});

test('first-open timing and hovering the already-open item remain native', (t) => {
  const { target_menu, history, clock } = create_hover_fixture();

  dispatch_menu_hover(target_menu, history.dom);
  clock.tick(500);
  t.deepEqual(target_menu.calls, []);
  t.is(target_menu.currentSubmenu, null);

  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, history.dom);
  clock.tick(500);
  t.deepEqual(target_menu.calls, []);
  t.is(target_menu.currentSubmenu, history.submenu);
});

test('nested hover events leave ancestor selections and child clicks intact', async (t) => {
  const { menu, target_item, target_menu, history, blocks, clock } = create_hover_fixture();
  set_open_submenu(menu, target_item);
  set_open_submenu(target_menu, history);

  // Capture reaches ancestors first, but only the row's own menu should switch.
  dispatch_menu_hover(menu, blocks.dom, 'pointerover');
  dispatch_menu_hover(target_menu, blocks.dom, 'pointerover');
  clock.tick(250);
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
  const { target_menu, history, blocks, clock } = create_hover_fixture();
  set_open_submenu(target_menu, history);
  blocks.setDisabled(true);

  dispatch_menu_hover(target_menu, blocks.dom, 'pointerover');
  dispatch_menu_hover(target_menu, blocks.dom);
  clock.tick(500);

  t.deepEqual(target_menu.calls, []);
  t.is(target_menu.currentSubmenu, history.submenu);
  t.false(blocks.submenu.visible);
});

test('hovering an ordinary sibling closes the old child without opening a menu', (t) => {
  const { target_menu, history, clock } = create_hover_fixture();
  target_menu.addItem((item) => item.setTitle('Refresh'));
  set_open_submenu(target_menu, history);

  dispatch_menu_hover(target_menu, target_menu.items[2].dom);
  clock.tick(249);
  t.is(target_menu.currentSubmenu, history.submenu);
  clock.tick(1);

  t.deepEqual(target_menu.calls, ['close', ['select', 2]]);
  t.is(target_menu.currentSubmenu, null);
  t.false(history.submenu.visible);
});

test('padding, separators, and unrelated rows do not close an open submenu', (t) => {
  const { target_menu, history, clock } = create_hover_fixture();
  target_menu.addSeparator();
  set_open_submenu(target_menu, history);

  for (const target of [null, {}, { closest: () => null }, { closest: () => ({}) }]) {
    dispatch_menu_hover(target_menu, target);
  }
  clock.tick(500);

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

  t.is(menu.listeners.length, 4);
  t.is(target_menu.listeners.length, 4);
  t.is(menu.items[1].submenu.listeners.length, 4);
  t.is(menu.items[2].submenu.listeners.length, 4);
  t.is(target_menu.items[0].submenu.listeners.length, 0);
  t.is(menu.hide_callbacks.length, 1);
  t.is(target_menu.hide_callbacks.length, 1);
});

test('closing a branch closes its descendants and allows the branch to reopen', (t) => {
  const { menu, target_item, target_menu, history, blocks, clock } = create_hover_fixture();
  menu.addItem((item) => {
    item.setTitle('Other');
    item.setSubmenu().addItem((child) => child.setTitle('Other action'));
  });
  const other = menu.items[1];
  set_open_submenu(menu, target_item);
  set_open_submenu(target_menu, history);

  dispatch_menu_hover(menu, other.dom);
  clock.tick(250);
  t.false(target_menu.visible);
  t.false(history.submenu.visible);
  t.is(target_menu.currentSubmenu, null);

  dispatch_menu_hover(menu, target_item.dom);
  clock.tick(250);
  t.true(target_menu.visible);
  t.false(other.submenu.visible);
  // The first child still opens natively after re-entering its parent.
  set_open_submenu(target_menu, blocks);
  dispatch_menu_hover(target_menu, history.dom);
  clock.tick(250);
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
    t.is(menu.items[0].submenu.listeners.length, 4);
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


test('a brief excursion over a sibling is cancelled by returning to the open row', (t) => {
  const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
  set_open_submenu(target_menu, history);

  dispatch_menu_hover(target_menu, blocks.dom);
  clock.tick(100);
  dispatch_menu_hover(target_menu, history.dom);
  clock.tick(500);

  t.is(target_menu.currentSubmenu, history.submenu);
  t.deepEqual(target_menu.calls, []);
  t.is(clock.pending_count, 0);
  t.is(owner_document.listeners.length, 0);
  t.is(clock.listeners.length, 0);
});

test('leaving the parent for a separately mounted submenu cancels a pending switch', (t) => {
  for (const type of ['pointerleave', 'mouseleave']) {
    const { target_menu, history, blocks, clock } = create_hover_fixture();
    set_open_submenu(target_menu, history);

    dispatch_menu_hover(target_menu, blocks.dom);
    clock.tick(100);
    dispatch_menu_hover(target_menu, target_menu.dom, type);
    dispatch_menu_hover(history.submenu, history.submenu.items[0].dom);
    clock.tick(500);

    t.is(target_menu.currentSubmenu, history.submenu);
    t.deepEqual(target_menu.calls, []);
    t.is(clock.pending_count, 0);
  }
});

test('re-entering a nested child cancels an ancestor switch without changing selection', (t) => {
  const { target_menu, history, blocks, clock } = create_hover_fixture();
  set_open_submenu(target_menu, history);

  dispatch_menu_hover(target_menu, blocks.dom);
  clock.tick(100);
  dispatch_menu_hover(target_menu, history.submenu.items[0].dom);
  clock.tick(500);

  t.is(target_menu.currentSubmenu, history.submenu);
  t.is(target_menu.selected, 0);
  t.deepEqual(target_menu.calls, []);
  t.is(clock.pending_count, 0);
});

test('moving across siblings gives only the latest row a fresh grace period', (t) => {
  const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
  target_menu.addItem((item) => item.setTitle('Other').setSubmenu());
  const other = target_menu.items[2];
  set_open_submenu(target_menu, history);

  dispatch_menu_hover(target_menu, blocks.dom);
  clock.tick(100);
  dispatch_menu_hover(target_menu, other.dom);
  t.is(clock.pending_count, 1);
  t.is(owner_document.listeners.length, 4);
  clock.tick(249);
  t.is(target_menu.currentSubmenu, history.submenu);
  clock.tick(1);

  t.is(target_menu.currentSubmenu, other.submenu);
  t.deepEqual(target_menu.calls, ['close', ['select', 2], ['open', 'Other']]);
  t.false(blocks.submenu.visible);
  t.is(owner_document.listeners.length, 0);
  t.is(clock.listeners.length, 0);
});

test('padding, separators, disabled rows, and unrelated rows cancel pending switches', (t) => {
  for (const kind of ['padding', 'separator', 'disabled', 'unrelated']) {
    const { target_menu, history, blocks, clock } = create_hover_fixture();
    target_menu.addItem((item) => item.setTitle('Disabled').setDisabled(true));
    target_menu.addSeparator();
    const targets = {
      padding: target_menu.dom,
      separator: { closest: () => null },
      disabled: target_menu.items[2].dom,
      unrelated: { closest: () => ({}) },
    };
    set_open_submenu(target_menu, history);

    dispatch_menu_hover(target_menu, blocks.dom);
    clock.tick(100);
    dispatch_menu_hover(target_menu, targets[kind]);
    clock.tick(500);

    t.is(target_menu.currentSubmenu, history.submenu);
    t.deepEqual(target_menu.calls, []);
    t.is(clock.pending_count, 0);
  }
});

test('explicit input cancels pending hover without consuming native events', (t) => {
  for (const type of ['keydown', 'pointerdown', 'mousedown', 'click']) {
    const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
    set_open_submenu(target_menu, history);
    const hover_event = dispatch_menu_hover(target_menu, blocks.dom);
    clock.tick(100);
    const event = owner_document.dispatch(type, blocks.dom, { key: 'Escape' });
    clock.tick(500);

    t.is(target_menu.currentSubmenu, history.submenu);
    t.deepEqual(target_menu.calls, []);
    t.false(hover_event.defaultPrevented);
    t.false(hover_event.propagation_stopped);
    t.false(event.defaultPrevented);
    t.false(event.propagation_stopped);
    t.is(clock.pending_count, 0);
    t.is(owner_document.listeners.length, 0);
  }
});

test('a click still runs its action immediately during the grace period', async (t) => {
  const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
  let click_count = 0;
  target_menu.addItem((item) => {
    item.setTitle('Refresh').onClick(() => { click_count += 1; });
  });
  const refresh = target_menu.items[2];
  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, blocks.dom);

  owner_document.dispatch('click', refresh.dom);
  await refresh.on_click();
  t.is(click_count, 1);
  t.is(clock.pending_count, 0);
  clock.tick(500);
  t.deepEqual(target_menu.calls, []);
});

test('dismissal clears hover state before the same branch is reopened', (t) => {
  const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
  let hidden_count = 0;
  target_menu.onHide(() => { hidden_count += 1; });
  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, blocks.dom);
  clock.tick(100);

  target_menu.hide();
  t.is(hidden_count, 1);
  t.is(clock.pending_count, 0);
  t.is(owner_document.listeners.length, 0);
  t.is(clock.listeners.length, 0);
  set_open_submenu(target_menu, history);
  target_menu.calls.length = 0;
  clock.tick(500);
  t.is(target_menu.currentSubmenu, history.submenu);
  t.deepEqual(target_menu.calls, []);

  dispatch_menu_hover(target_menu, blocks.dom);
  clock.tick(250);
  t.is(target_menu.currentSubmenu, blocks.submenu);
});

test('closing an ancestor cancels pending work in its descendants', (t) => {
  const { menu, target_item, target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
  set_open_submenu(menu, target_item);
  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, blocks.dom);

  menu.hide();
  t.is(clock.pending_count, 0);
  t.is(owner_document.listeners.length, 0);
  target_menu.calls.length = 0;
  clock.tick(500);
  t.false(target_menu.visible);
  t.false(blocks.submenu.visible);
  t.deepEqual(target_menu.calls, []);
});

test('native navigation wins over a stale pending hover', (t) => {
  const { target_menu, history, blocks, clock } = create_hover_fixture();
  target_menu.addItem((item) => item.setTitle('Native').setSubmenu());
  const native_item = target_menu.items[2];
  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, blocks.dom);

  target_menu.closeSubmenu();
  set_open_submenu(target_menu, native_item);
  target_menu.calls.length = 0;
  clock.tick(250);

  t.is(target_menu.currentSubmenu, native_item.submenu);
  t.deepEqual(target_menu.calls, []);
  t.is(clock.pending_count, 0);
});

test('detached menus cannot be changed by a delayed hover', (t) => {
  for (const detach_child of [false, true]) {
    const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
    set_open_submenu(target_menu, history);
    dispatch_menu_hover(target_menu, blocks.dom);
    (detach_child ? history.submenu : target_menu).dom.isConnected = false;
    clock.tick(250);

    t.deepEqual(target_menu.calls, []);
    t.is(clock.pending_count, 0);
    t.is(owner_document.listeners.length, 0);
  }
});

test('pending rows are revalidated after becoming disabled or being removed', (t) => {
  for (const remove of [false, true]) {
    const { target_menu, history, blocks, clock } = create_hover_fixture();
    set_open_submenu(target_menu, history);
    dispatch_menu_hover(target_menu, blocks.dom);
    if (remove) target_menu.items.splice(1, 1);
    else blocks.setDisabled(true);
    clock.tick(250);

    t.is(target_menu.currentSubmenu, history.submenu);
    t.deepEqual(target_menu.calls, []);
    t.is(clock.pending_count, 0);
  }
});

test('a reordered pending row is selected using its current index', (t) => {
  const { target_menu, history, blocks, clock } = create_hover_fixture();
  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, blocks.dom);
  target_menu.items.reverse();
  clock.tick(250);

  t.is(target_menu.currentSubmenu, blocks.submenu);
  t.deepEqual(target_menu.calls, ['close', ['select', 0], ['open', 'Blocks']]);
});

test('window blur clears pending work and temporary listeners', (t) => {
  const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, blocks.dom);
  clock.dispatch('blur');
  clock.tick(500);

  t.is(target_menu.currentSubmenu, history.submenu);
  t.deepEqual(target_menu.calls, []);
  t.is(clock.pending_count, 0);
  t.is(owner_document.listeners.length, 0);
  t.is(clock.listeners.length, 0);
});

test('hover clocks and explicit input are isolated to the owning window', (t) => {
  const first = create_hover_fixture();
  const second = create_hover_fixture();
  for (const fixture of [first, second]) {
    set_open_submenu(fixture.target_menu, fixture.history);
    dispatch_menu_hover(fixture.target_menu, fixture.blocks.dom);
  }

  first.owner_document.dispatch('keydown', first.target_menu.dom);
  first.clock.tick(500);
  second.clock.tick(249);
  t.is(first.target_menu.currentSubmenu, first.history.submenu);
  t.is(second.target_menu.currentSubmenu, second.history.submenu);
  second.clock.tick(1);
  t.is(second.target_menu.currentSubmenu, second.blocks.submenu);
  t.is(first.clock.pending_count, 0);
  t.is(second.clock.pending_count, 0);
});

test('menus shown in a different document use that document for timers and input', (t) => {
  const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
  const shown_document = create_hover_document();
  target_menu.dom.ownerDocument = shown_document;
  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, blocks.dom);

  t.is(clock.pending_count, 0);
  t.is(owner_document.listeners.length, 0);
  t.is(shown_document.defaultView.pending_count, 1);
  shown_document.dispatch('keydown', target_menu.dom);
  shown_document.defaultView.tick(500);
  t.is(target_menu.currentSubmenu, history.submenu);
  t.is(shown_document.listeners.length, 0);
});

test('a document change invalidates an old timer and allows a fresh hover', (t) => {
  const { target_menu, history, blocks, clock, owner_document } = create_hover_fixture();
  const shown_document = create_hover_document();
  set_open_submenu(target_menu, history);
  dispatch_menu_hover(target_menu, blocks.dom);
  clock.tick(100);
  target_menu.dom.ownerDocument = shown_document;
  clock.tick(150);

  t.is(target_menu.currentSubmenu, history.submenu);
  t.is(owner_document.listeners.length, 0);
  dispatch_menu_hover(target_menu, blocks.dom);
  shown_document.defaultView.tick(250);
  t.is(target_menu.currentSubmenu, blocks.submenu);
});
