import test from 'ava';
import { SmartContext as CoreSmartContext } from 'smart-contexts/smart_context.js';
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

test('context_suggest_contexts adds a named-context rule from the add-all row', async (t) => {
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
  t.deepEqual(added_items, [{
    key: 'Alpha',
    kind: 'named_context',
    named_context: true,
  }]);
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

test('context_suggest_contexts mod_select_action adds a named-context rule', async (t) => {
  const { ctx, added_items } = build_ctx();
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(ctx, { modal });
  await suggestions[0].mod_select_action({ modal });

  t.deepEqual(added_items, [{
    key: 'Alpha',
    kind: 'named_context',
    named_context: true,
  }]);
});

test('legacy copy_context_items params do not change named-context behavior', async (t) => {
  const { ctx, added_items } = build_ctx();
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(ctx, {
    modal,
    copy_context_items: true,
  });
  await suggestions[0].mod_select_action({ modal });

  t.deepEqual(added_items, [{
    key: 'Alpha',
    kind: 'named_context',
    named_context: true,
  }]);
});

test('context_suggest_contexts hides an already included named context', async (t) => {
  const { ctx } = build_ctx();
  ctx.data.context_items.Alpha = {
    key: 'Alpha',
    named_context: true,
  };

  const suggestions = await context_suggest_contexts.call(ctx, {
    modal: build_modal(),
  });

  t.deepEqual(suggestions, []);
});

test('context_suggest_contexts uses the same rule for codeblock contexts', async (t) => {
  const { ctx: codeblock_ctx, added_items } = build_codeblock_ctx();
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(codeblock_ctx, { modal });
  await suggestions[0].mod_select_action({ modal });

  t.deepEqual(added_items, [{
    key: 'Alpha',
    kind: 'named_context',
    named_context: true,
  }]);
});

test('context_suggest_contexts item select adds only the selected item', async (t) => {
  const { ctx, added_items } = build_ctx();
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(ctx, { modal });
  const item_suggestions = await suggestions[0].select_action({ modal });

  await item_suggestions[1].select_action({ modal });

  t.is(added_items.length, 1);
  t.is(added_items[0].key, 'note-a.md');
  t.false(Object.prototype.hasOwnProperty.call(added_items[0], 'from_named_context'));
});

test('context_suggest_contexts preserves selected item identity metadata', async (t) => {
  const { ctx, added_items } = build_ctx();
  ctx.env.smart_contexts.items.alpha.data.context_items = /** @type {*} */ ({
    'archive.md': {
      key: 'archive.md',
      kind: 'folder',
      source_path: 'archive.md',
      folder: true,
    },
  });
  const modal = build_modal();

  const suggestions = await context_suggest_contexts.call(ctx, { modal });
  const item_suggestions = await suggestions[0].select_action({ modal });
  await item_suggestions[1].select_action({ modal });

  t.deepEqual(added_items, [{
    key: 'archive.md',
    kind: 'folder',
    source_path: 'archive.md',
    folder: true,
  }]);
});

test('context_suggest_contexts strips source-context provenance and hydration state', async (t) => {
  const { ctx, added_items } = build_ctx();
  ctx.env.smart_contexts.items.alpha.data.context_items = /** @type {*} */ ({
    'notes/a.md#Heading': {
      key: 'notes/a.md#Heading',
      kind: 'block',
      source_path: 'notes/a.md',
      subpath: 'Heading',
      section: 'Current',
      content: 'adapter-specific content',
      score: 0.75,
      from_folder: 'notes',
      from_named_context: 'Nested',
      folder: 'notes',
      d: 3,
      at: 123,
      size: 99,
      mtime: 456,
      group_items_ct: 4,
      truncated: true,
      truncated_max_items: 1000,
      missing: true,
      exclude: false,
    },
  });

  const suggestions = await context_suggest_contexts.call(ctx, {
    modal: build_modal(),
  });
  const item_suggestions = await suggestions[0].select_action({
    modal: build_modal(),
  });
  t.is(item_suggestions[1].display_right, 'depth 3');
  await item_suggestions[1].select_action({ modal: build_modal() });

  t.deepEqual(added_items, [{
    key: 'notes/a.md#Heading',
    kind: 'block',
    source_path: 'notes/a.md',
    subpath: 'Heading',
    section: 'Current',
    content: 'adapter-specific content',
    score: 0.75,
  }]);
});

test('context_suggest_contexts adds a selected derived item as directly removable', async (t) => {
  const { ctx } = build_ctx();
  ctx.data.context_items = /** @type {*} */ ({});
  ctx.env.smart_contexts.items.alpha.data.context_items = /** @type {*} */ ({
    'notes/direct.md': {
      key: 'notes/direct.md',
      kind: 'source',
      source_path: 'notes/direct.md',
      from_folder: 'notes',
      from_named_context: 'Nested',
      folder: 'notes',
      d: 3,
      at: 123,
      size: 99,
      mtime: 456,
    },
  });
  ctx.queue_save = () => {};
  ctx.emit_event = () => {};
  ctx.add_item = (item) => CoreSmartContext.prototype.add_item.call(ctx, item);

  const suggestions = await context_suggest_contexts.call(ctx, {
    modal: build_modal(),
  });
  const item_suggestions = await suggestions[0].select_action({
    modal: build_modal(),
  });
  await item_suggestions[1].select_action({ modal: build_modal() });

  const added_item = ctx.data.context_items['notes/direct.md'];
  t.like(added_item, {
    key: 'notes/direct.md',
    kind: 'source',
    source_path: 'notes/direct.md',
    d: 0,
  });
  t.false(Object.prototype.hasOwnProperty.call(added_item, 'from_folder'));
  t.false(Object.prototype.hasOwnProperty.call(added_item, 'from_named_context'));
  t.false(Object.prototype.hasOwnProperty.call(added_item, 'folder'));
  t.not(added_item.at, 123);

  CoreSmartContext.prototype.remove_item.call(ctx, 'notes/direct.md');

  t.false('notes/direct.md' in ctx.data.context_items);
});
