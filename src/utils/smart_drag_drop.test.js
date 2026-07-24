import test from 'ava';
import {
  SMART_DRAG_DATA_TYPE,
  read_smart_drag_data,
  write_smart_drag_data,
} from './smart_drag_drop.js';

function create_data_transfer(initial_data = {}) {
  const data = { ...initial_data };
  return {
    data,
    getData(type) {
      return data[type] || '';
    },
    setData(type, value) {
      data[type] = value;
    },
  };
}

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
