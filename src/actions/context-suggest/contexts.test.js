import test from 'ava';
import { context_suggest_contexts } from './contexts.js';

const build_ctx = () => {
  const added_items = [];
  const emitted_events = [];

  const ctx = {
    env: {
      smart_contexts: {
        items: {
          alpha: {
            key: 'alpha',
            data: {
              key: 'alpha',
              name: 'Alpha',
              context_items: {
                'note-a.md': { d: 1 },
                'note-b.md': { d: 2 },
              },
            },
          },
        },
      },
    },
    data: {
      context_items: {
        'note-a.md': { d: 0 },
      },
    },
    add_items: (items) => {
      added_items.push(...items);
    },
    add_item: (item) => {
      added_items.push(item);
    },
    emit_event: (event_name, payload) => {
      emitted_events.push({ event_name, payload });
    },
  };

  return { ctx, added_items, emitted_events };
};

const build_codeblock_ctx = () => {
  const { ctx, added_items, emitted_events } = build_ctx();
  ctx.key = 'note.md#codeblock';
  ctx.data.codeblock_named_contexts = [];

  return { ctx, added_items, emitted_events };
};

const build_modal = () => ({
  instructions_log: [],
  closed: false,
  setInstructions(instructions) {
    this.instructions_log.push(instructions);
  },
  close() {
    this.closed = true;
  },
});

test('context_suggest_contexts returns item suggestions on select', async (t) => {
  const { ctx, added_items } = build_ctx();
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(ctx, { modal });

  t.true(modal.instructions_log.length > 0);
  t.true(modal.instructions_log[0].some((entry) => /^(⌘|Ctrl) \+ Enter$/.test(entry.command)));
  t.true(suggestions.length > 0);

  const item_suggestions = await suggestions[0].select_action({ modal });
  t.true(Array.isArray(item_suggestions));
  t.true(item_suggestions.length > 0);
  t.is(added_items.length, 0);

  await item_suggestions[0].select_action({ modal });
  t.true(added_items.length > 0);
  t.true(modal.instructions_log.length > 1);
});

test('context_suggest_contexts arrow_right_action mirrors select behavior', async (t) => {
  const { ctx } = build_ctx();
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(ctx, { modal });
  const item_suggestions = await suggestions[0].arrow_right_action({ modal });

  t.true(Array.isArray(item_suggestions));
  t.true(item_suggestions.length > 0);
});

test('context_suggest_contexts mod_select_action adds all items', async (t) => {
  const { ctx, added_items } = build_ctx();
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(ctx, { modal });
  await suggestions[0].mod_select_action({ modal });

  t.true(added_items.length > 0);
  t.true(added_items.every((item) => item.from_named_context === 'Alpha'));
});

test('context_suggest_contexts stores named context line for codeblock ctx', async (t) => {
  const { ctx: codeblock_ctx, added_items } = build_codeblock_ctx();
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(codeblock_ctx, { modal });
  await suggestions[0].mod_select_action({ modal });

  t.deepEqual(codeblock_ctx.data.codeblock_named_contexts, ['Alpha']);
  t.true(added_items.length > 0);
  t.true(added_items.every((item) => item.from_named_context === 'Alpha'));
});
