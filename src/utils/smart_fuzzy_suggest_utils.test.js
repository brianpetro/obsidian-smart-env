import test from 'ava';

import { build_suggest_scope_items } from './smart_fuzzy_suggest_utils.js';

test('build_suggest_scope_items filters missing handlers and uses display_name', (t) => {
  const updates = [];
  const modal = {
    env: {
      config: {
        actions: {
          add_sources: { display_name: 'Add sources' },
          missing_handler: { display_name: 'Missing' },
        },
      },
    },
    item_or_collection: {
      actions: {
        add_sources() {},
      },
    },
    update_suggestions(action_key) {
      updates.push(action_key);
    },
  };

  const result = build_suggest_scope_items(modal, {
    action_keys: ['add_sources', 'missing_handler'],
  });

  t.is(result.length, 1);
  t.is(result[0].display, 'Add sources');
  result[0].select_action();
  t.deepEqual(updates, ['add_sources']);
});

test('build_suggest_scope_items dedupes keys and falls back to key label', (t) => {
  const modal = {
    env: {
      config: {
        actions: {},
      },
    },
    item_or_collection: {
      actions: {
        alpha() {},
        beta() {},
      },
    },
    update_suggestions() {},
  };

  const result = build_suggest_scope_items(modal, {
    action_keys: ['alpha', 'alpha', 'beta'],
  });

  t.deepEqual(
    result.map((item) => item.display),
    ['alpha', 'beta'],
  );
});
