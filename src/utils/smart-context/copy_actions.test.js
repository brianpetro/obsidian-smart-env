import test from 'ava';
import {
  build_context_actions_menu,
  has_linked_depth_items,
  register_context_menu_actions,
  register_copy_menu_actions,
} from './copy_actions.js';

function build_menu_registry() {
  const registered_actions = {};
  return {
    called_menu_keys: [],
    register_menu_action(menu_key, fn) {
      if (!registered_actions[menu_key]) registered_actions[menu_key] = new Set();
      registered_actions[menu_key].add(fn);
    },
    build_menu(menu_key, menu, scope) {
      this.called_menu_keys.push(menu_key);
      const actions = registered_actions[menu_key] || new Set();
      actions.forEach((menu_action) => {
        menu_action(menu, scope);
      });
    },
  };
}

function build_ctx(params = {}) {
  const context_items = Array.isArray(params.context_items) ? params.context_items : [];
  const env = params.env || build_menu_registry();
  return {
    item_count: params.item_count ?? context_items.length,
    excluded_item_count: params.excluded_item_count ?? 0,
    context_items: {
      filter(predicate) {
        if (typeof predicate === 'function') return context_items.filter(predicate);
        return context_items;
      },
    },
    actions: {
      context_copy_to_clipboard() {},
    },
    clear_all() {},
    emit_event() {},
    env: {
      plugin: { app: {} },
      config: {
        modals: {
          copy_context_modal: {
            class: class CopyContextModal {
              open() {}
            },
          },
        },
      },
      ...env,
    },
  };
}

function build_menu_recorder() {
  const menu = {
    items: [],
    addItem(callback) {
      const item = {
        _order: 0,
        title: '',
        setTitle(title) {
          this.title = title;
          return this;
        },
        setIcon() { return this; },
        setDisabled() { return this; },
        onClick() { return this; },
      };
      this.items.push(item);
      callback(item);
      return this;
    },
    addSeparator() {
      this.items.push({ separator: true, title: '---', _order: 0 });
      return this;
    },
  };
  return { menu };
}

function get_menu_titles(menu) {
  return menu.items.map((item) => item.separator ? '---' : item.title);
}

test('has_linked_depth_items detects non-zero depths only', (t) => {
  t.false(has_linked_depth_items(build_ctx({
    context_items: [{ key: 'root.md', data: { d: 0 } }],
  })));

  t.true(has_linked_depth_items(build_ctx({
    context_items: [
      { key: 'root.md', data: { d: 0 } },
      { key: 'child.md', data: { d: 2 } },
    ],
  })));
});


test('build_context_actions_menu uses registered copy and action scopes', (t) => {
  const env = build_menu_registry();
  register_copy_menu_actions(env);
  register_context_menu_actions(env);
  env.register_menu_action('smart_context:copy_menu', (menu) => {
    menu.addItem((item) => {
      item.setTitle('Registered copy action')
        .setIcon('copy')
        .onClick(() => {});
      item._order = 2;
    });
  });
  env.register_menu_action('smart_context:actions_menu', (menu) => {
    menu.addItem((item) => {
      item.setTitle('Registered context action')
        .setIcon('sparkles')
        .onClick(() => {});
      item._order = 4;
    });
  });

  const { menu } = build_menu_recorder();
  const ctx = build_ctx({
    env,
    context_items: [{ key: 'root.md', data: { d: 0 } }],
  });

  build_context_actions_menu(ctx, menu);

  const titles = get_menu_titles(menu);

  t.deepEqual(env.called_menu_keys, [
    'smart_context:copy_menu',
    'smart_context:actions_menu',
  ]);
  t.true(titles.includes('Copy text'));
  t.true(titles.includes('Copy link tree'));
  t.true(titles.includes('Registered copy action'));
  t.true(titles.includes('Registered context action'));
  t.true(titles.includes('Clear this context'));
  t.true(titles.indexOf('Clear this context') > titles.indexOf('---'));
});

