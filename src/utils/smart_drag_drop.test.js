import test from 'ava';
import {
  SMART_DRAG_DATA_TYPE,
  has_smart_drag_data,
  read_smart_drag_data,
  resolve_smart_drag_items,
  write_smart_drag_data,
} from './smart_drag_drop.js';

function create_data_transfer(initial_data = {}) {
  const data = { ...initial_data };
  return {
    data,
    get types() {
      return Object.keys(data);
    },
    getData(type) {
      return data[type] || '';
    },
    setData(type, value) {
      data[type] = value;
    },
  };
}

test('has_smart_drag_data distinguishes absent and present Smart MIME data', (t) => {
  const absent = create_data_transfer();
  const present_empty = create_data_transfer({
    [SMART_DRAG_DATA_TYPE]: '',
  });
  const present_malformed = create_data_transfer({
    [SMART_DRAG_DATA_TYPE]: '{not-json',
  });

  t.false(has_smart_drag_data(absent));
  t.true(has_smart_drag_data(present_empty));
  t.true(has_smart_drag_data(present_malformed));
});

test('write_smart_drag_data writes one Smart item ref', (t) => {
  const data_transfer = create_data_transfer();

  const written = write_smart_drag_data(data_transfer, {
    collection_key: 'smart_sources',
    key: 'Notes/Example.md',
  });

  t.true(written);
  t.deepEqual(read_smart_drag_data(data_transfer), {
    schema: 'smart-env-drag',
    version: 1,
    items: [
      {
        collection_key: 'smart_sources',
        item_key: 'Notes/Example.md',
      },
    ],
  });
});

test('write_smart_drag_data writes several refs and omits invalid items', (t) => {
  const data_transfer = create_data_transfer();

  const written = write_smart_drag_data(data_transfer, [
    {
      collection_key: 'smart_sources',
      key: 'A.md',
    },
    {
      collection_key: 'smart_blocks',
      item_key: 'A.md#Heading',
    },
    {
      collection_key: 'smart_sources',
    },
    null,
  ]);

  t.true(written);
  t.deepEqual(read_smart_drag_data(data_transfer)?.items, [
    {
      collection_key: 'smart_sources',
      item_key: 'A.md',
    },
    {
      collection_key: 'smart_blocks',
      item_key: 'A.md#Heading',
    },
  ]);
});

test('write_smart_drag_data returns false when no valid refs exist', (t) => {
  const data_transfer = create_data_transfer();

  t.false(write_smart_drag_data(data_transfer, [{ key: 'A.md' }]));
  t.false(Object.prototype.hasOwnProperty.call(data_transfer.data, SMART_DRAG_DATA_TYPE));
});

test('read_smart_drag_data returns null for malformed JSON', (t) => {
  const data_transfer = create_data_transfer({
    [SMART_DRAG_DATA_TYPE]: '{not-json',
  });

  t.is(read_smart_drag_data(data_transfer), null);
});

test('read_smart_drag_data returns null for another schema or version', (t) => {
  const wrong_schema = create_data_transfer({
    [SMART_DRAG_DATA_TYPE]: JSON.stringify({
      schema: 'other-drag',
      version: 1,
      items: [{ collection_key: 'smart_sources', item_key: 'A.md' }],
    }),
  });
  const wrong_version = create_data_transfer({
    [SMART_DRAG_DATA_TYPE]: JSON.stringify({
      schema: 'smart-env-drag',
      version: 2,
      items: [{ collection_key: 'smart_sources', item_key: 'A.md' }],
    }),
  });

  t.is(read_smart_drag_data(wrong_schema), null);
  t.is(read_smart_drag_data(wrong_version), null);
});


test('read_smart_drag_data requires canonical item_key refs', (t) => {
  const data_transfer = create_data_transfer({
    [SMART_DRAG_DATA_TYPE]: JSON.stringify({
      schema: 'smart-env-drag',
      version: 1,
      items: [
        {
          collection_key: 'smart_sources',
          key: 'A.md',
        },
      ],
    }),
  });

  t.is(read_smart_drag_data(data_transfer), null);
});

test('read_smart_drag_data preserves an exact block key', (t) => {
  const block_key = 'Projects/Example.md#Section#{12-18}';
  const data_transfer = create_data_transfer({
    [SMART_DRAG_DATA_TYPE]: JSON.stringify({
      schema: 'smart-env-drag',
      version: 1,
      items: [
        {
          collection_key: 'smart_blocks',
          item_key: block_key,
        },
      ],
    }),
  });

  t.is(read_smart_drag_data(data_transfer)?.items[0].item_key, block_key);
});

test('read_smart_drag_data rejects an entire batch containing a malformed ref', t => {
  const data_transfer = create_data_transfer({
    [SMART_DRAG_DATA_TYPE]: JSON.stringify({
      schema: 'smart-env-drag', version: 1,
      items: [{ collection_key: 'smart_sources', item_key: 'A.md' }, { item_key: 'B.md' }],
    }),
  });
  t.is(read_smart_drag_data(data_transfer), null);
});

test('resolve_smart_drag_items preserves exact heterogeneous selection order and deduplicates refs', t => {
  const source = { collection_key: 'smart_sources', key: 'Projects/Plan.md' };
  const block = { collection_key: 'smart_blocks', key: 'Projects/Plan.md#Scope#{12-18}' };
  const context = { collection_key: 'smart_contexts', key: 'stable-context-id' };
  const items = [block, context, source, block];
  const env = Object.fromEntries([source, block, context].map(item => [item.collection_key, { get: key => key === item.key ? item : null }]));
  t.deepEqual(resolve_smart_drag_items(env, items.map(item => ({ collection_key: item.collection_key, item_key: item.key }))), [block, context, source]);
});

test('resolve_smart_drag_items rejects missing, gone and mismatched identities instead of recovering names', t => {
  const ref = { collection_key: 'smart_sources', item_key: 'Projects/Plan.md' };
  for (const item of [null,
    { collection_key: ref.collection_key, key: 'Other/Plan.md' },
    { collection_key: 'smart_blocks', key: ref.item_key },
    { collection_key: ref.collection_key, key: ref.item_key, is_gone: true },
  ]) {
    t.throws(() => resolve_smart_drag_items({ smart_sources: { get: () => item } }, [ref]), { message: /no longer exists/ });
  }
});
