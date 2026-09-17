import test from 'ava';
import { context_suggest_blocks } from './blocks.js';

function create_context() {
  const added_items = [];
  const ctx = {
    env: {
      smart_blocks: {
        items: {
          second: { key: 'notes/a.md#Second', lines: [10, 15] },
          first: { key: 'notes/a.md#First', lines: [1, 9] },
        },
      },
    },
    add_item: (key) => added_items.push(key),
  };
  return { ctx, added_items };
}

test('context_suggest_blocks keeps block ordering and single-item additions', (t) => {
  const { ctx, added_items } = create_context();
  const suggestions = context_suggest_blocks.call(ctx);

  t.deepEqual(suggestions.map((suggestion) => suggestion.key), [
    'notes/a.md#First',
    'notes/a.md#Second',
  ]);
  suggestions[0].select_action();
  t.deepEqual(added_items, ['notes/a.md#First']);
});

test('context_suggest_blocks back-navigation uses the canonical mode setter', async (t) => {
  const { ctx } = create_context();
  const calls = [];
  const notes = [{ key: 'notes/a.md' }];
  const modal = {
    set_active_source_mode(action_key) {
      calls.push(action_key);
      return Promise.resolve(notes);
    },
    update_suggestions() {
      t.fail('The canonical presenter must use its mode setter');
    },
  };

  const [suggestion] = context_suggest_blocks.call(ctx);
  t.is(await suggestion.arrow_left_action({ modal }), notes);
  t.deepEqual(calls, ['context_suggest_sources']);
});

test('context_suggest_blocks back-navigation supports the legacy presenter', async (t) => {
  const { ctx } = create_context();
  const calls = [];
  const notes = [{ key: 'notes/a.md' }];
  const modal = {
    update_suggestions(action_key) {
      calls.push(action_key);
      return Promise.resolve(notes);
    },
  };

  const [suggestion] = context_suggest_blocks.call(ctx);
  t.is(await suggestion.arrow_left_action({ modal }), notes);
  t.deepEqual(calls, ['context_suggest_sources']);
});
