import test from 'ava';
import { SmartContext } from '../../items/smart_context.js';
import { context_item_remove, menus } from './remove.js';

function create_context(context_items = {}) {
  return Object.assign(Object.create(SmartContext.prototype), {
    data: { context_items },
    emit_event() {},
    queue_save() {},
  });
}

test('standalone removal uses the originating collection instead of a changed environment owner', async (t) => {
  const owner = create_context({ 'notes/a.md#Heading': {}, 'notes/b.md': {} });
  const other = create_context({ 'notes/a.md': {} });
  const item = {
    key: 'notes/a.md',
    context_items: { smart_context: owner },
    collection: { smart_context: other },
  };

  t.true(await context_item_remove.call(item, { smart_context: other }));
  t.deepEqual(Object.keys(owner.data.context_items), ['notes/b.md']);
  t.true('notes/a.md' in other.data.context_items);
  t.false(await context_item_remove.call(item));
});

for (const param_key of ['smart_context', 'ctx']) {
  test(`standalone removal uses explicit ${param_key} before the environment collection`, async (t) => {
    const owner = create_context({ 'notes/a.md#Heading': {} });
    const other = create_context({ 'notes/a.md': {} });
    const item = { key: 'notes/a.md', collection: { smart_context: other } };

    t.true(await context_item_remove.call(item, { [param_key]: owner }));
    t.deepEqual(owner.data.context_items, {});
    t.true('notes/a.md' in other.data.context_items);
  });
}

test('standalone removal retains the collection fallback and reports unmatched paths as no-ops', async (t) => {
  const owner = create_context({ 'notes/a.md': {}, 'notes/a.md{1}': {} });
  const item = { key: 'notes/a.md', collection: { smart_context: owner } };

  t.true(await context_item_remove.call(item));
  t.deepEqual(owner.data.context_items, {});
  t.false(await context_item_remove.call(item));
});

for (const { name, data = {}, params = {}, folder } of [
  { name: 'explicit folder target', params: { folder: true }, folder: true },
  { name: 'stored folder flag', data: { folder: true }, folder: true },
  { name: 'canonical folder kind', data: { kind: 'folder' }, folder: true },
  { name: 'legacy folder provenance', data: { folder: 'notes' }, folder: false },
  { name: 'canonical folder provenance', data: { from_folder: 'notes' }, folder: false },
]) {
  test(`standalone removal passes ${name} correctly`, async (t) => {
    const calls = [];
    const owner = {
      remove_by_path(key, options) {
        calls.push({ key, options });
        return [key];
      },
    };
    const item = { key: 'notes/branch', data, context_items: { smart_context: owner } };

    t.true(await context_item_remove.call(item, params));
    t.deepEqual(calls, [{ key: item.key, options: { folder } }]);
  });
}

test('standalone removal does not fall back to direct deletion without semantic support', async (t) => {
  const item = { key: 'notes/a.md', collection: { smart_context: {
    remove_item() { t.fail('Direct removal must not be used'); },
  } } };

  t.false(await context_item_remove.call(item));
  t.false(await context_item_remove.call({ key: item.key }));
});

test('disabled removal preserves the Builder handler and never mutates', async (t) => {
  const event = {};
  const item = { key: 'notes/a.md' };
  let disabled_called = false;

  t.false(await context_item_remove.call(item, {
    remove_disabled: true,
    click_event: event,
    on_remove() { t.fail('Disabled removal must not call on_remove'); },
    async on_remove_disabled(received_event, received_item) {
      t.is(received_event, event);
      t.is(received_item, item);
      disabled_called = true;
    },
  }));
  t.true(disabled_called);
  t.false(await context_item_remove.call(item, { remove_disabled: true }));
  t.true(menus['context_item:action_menu'].disabled.call({ params: { remove_disabled: true } }));
});

test('Builder on_remove remains authoritative and awaited', async (t) => {
  const event = {};
  const item = { key: 'notes/a.md', context_items: { smart_context: {
    remove_by_path() { t.fail('Builder callback must bypass standalone mutation'); },
  } } };
  let completed = false;

  t.true(await context_item_remove.call(item, {
    event,
    async on_remove(received_event, received_item) {
      t.is(received_event, event);
      t.is(received_item, item);
      await Promise.resolve();
      completed = true;
    },
  }));
  t.true(completed);
});

test('standalone removal awaits semantic results and propagates mutation errors', async (t) => {
  const owner = { async remove_by_path() { return []; } };
  const item = { key: 'notes/a.md', context_items: { smart_context: owner } };
  t.false(await context_item_remove.call(item));
  owner.remove_by_path = async () => ['notes/a.md'];
  t.true(await context_item_remove.call(item));
  const error = new Error('Mutation failed');
  owner.remove_by_path = async () => { throw error; };
  t.is(await t.throwsAsync(() => context_item_remove.call(item)), error);
});
