import test from 'ava';
import { SmartContext } from './smart_context.js';

export function create_context(context_items = {}) {
  return {
    data: { context_items: { ...context_items } },
    emit_event: () => {},
    queue_save: () => {},
    env: { smart_contexts: { get_named_context: () => null } },
    named_contexts: Object.entries(context_items)
      .filter(([name, item_data]) => item_data?.named_context)
      .map(([name, item_data]) => (create_context(item_data.context_items || {})))
      .filter(Boolean),
    context_items: Object.entries(context_items)
      .reduce((acc, [name, item_data]) => {
        if (!item_data.context_items) {
          acc.items[name] = item_data;
        }
        if(item_data?.context_items) {
          const nested_items = Object.entries(item_data.context_items).map(([nested_name, nested_item_data]) => ({key: nested_name, data: nested_item_data}));
          nested_items.forEach((nested_item) => {
            acc.items[nested_item.key] = nested_item;
          });
        }
        return acc;
      }, { items: {} }),
    remove_items(keys, params = {}) {
      const items = Array.isArray(keys) ? keys : [keys];
      items.forEach((key) => {
        delete this.data.context_items[key];
      });
    },
  };
}

test('add_item allows block when parent source is not included', (t) => {
  const ctx = create_context({});

  SmartContext.prototype.add_item.call(ctx, 'notes/a.md#Heading');

  t.true('notes/a.md#Heading' in ctx.data.context_items);
  t.false('notes/a.md' in ctx.data.context_items);
});

test('add_item removes redundant block descendants when parent source is added', (t) => {
  const ctx = create_context({
    'notes/a.md#Heading': {},
    'notes/a.md#Heading#{1}': {},
    'notes/a.md2#Heading': {},
    'notes/b.md#Heading': {},
  });

  SmartContext.prototype.add_item.call(ctx, 'notes/a.md');

  t.true('notes/a.md' in ctx.data.context_items);
  t.false('notes/a.md#Heading' in ctx.data.context_items);
  t.false('notes/a.md#Heading#{1}' in ctx.data.context_items);
  t.false('notes/a.md2#Heading' in ctx.data.context_items);
  t.true('notes/b.md#Heading' in ctx.data.context_items);
});

// THIS SCENARIO SHOULD NOT HAPPEN (IF SOURCE IS INCLUDED THEN ALL BLOCKS ARE INCLUDED)
// HAPPENS WHEN ADDING BLOCKS THEN SUBSEQUENTLY ADDING SOURCE ITEM
test('remove_by_path removes direct source and nested heading descendants', (t) => {
  const ctx = create_context({
    'notes/a.md': {},
    'notes/a.md#Heading': {},
    'notes/a.md#Heading{1}': {},
    'notes/b.md': {},
  });

  SmartContext.prototype.remove_by_path.call(ctx, 'notes/a.md');

  t.false('notes/a.md' in ctx.data.context_items);
  t.false('notes/a.md#Heading' in ctx.data.context_items);
  t.false('notes/a.md#Heading{1}' in ctx.data.context_items);
  t.true('notes/b.md' in ctx.data.context_items);
});

test('remove_by_path removes descendant blocks when parent source is not directly included', (t) => {
  const ctx = create_context({
    'notes/a.md#Heading': {},
    'notes/a.md#Heading{1}': {},
    'notes/b.md': {},
  });

  SmartContext.prototype.remove_by_path.call(ctx, 'notes/a.md');

  t.false('notes/a.md#Heading' in ctx.data.context_items);
  t.false('notes/a.md#Heading{1}' in ctx.data.context_items);
  t.true('notes/b.md' in ctx.data.context_items);
});

// Core does not mutate or promote named-context children. The UI disables these
// remove controls and directs users to open the source named context instead.
test('remove_by_path does not promote named context children in Core', (t) => {
  const ctx = create_context({
    'named_ctx': { named_context: true, context_items: {
      'notes/a.md': {},
      'notes/b.md': {},
    }},
    'other/c.md': {},
  });

  const removed_keys = SmartContext.prototype.remove_by_path.call(ctx, 'notes/a.md');

  t.deepEqual(removed_keys, []);
  t.true('named_ctx' in ctx.data.context_items);
  t.false('notes/a.md' in ctx.data.context_items);
  t.false('notes/b.md' in ctx.data.context_items);
  t.true('other/c.md' in ctx.data.context_items);
});
