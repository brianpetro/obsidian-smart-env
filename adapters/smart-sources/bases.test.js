import test from 'ava';
import { BasesSourceContentAdapter } from './bases.js';

const create_adapter = (params = {}) => {
  const item = {
    data: {
      outlinks: [{ target: 'Cached result' }],
    },
    env: { settings: { smart_sources: {} } },
    collection: { fs: {} },
    file: { stat: { mtime: 10, size: 20 } },
    vec: params.vec ?? null,
    _queue_embed: params.queue_embed ?? false,
    queue_save() { this.save_queued = true; },
  };

  return {
    adapter: new BasesSourceContentAdapter(item),
    item,
  };
};

test('stable Base adapter disables raw source embeddings', t => {
  const { adapter } = create_adapter();

  t.false(adapter.should_embed);
});

test('stable Base init clears existing raw source embeddings', async t => {
  const source = {
    file_type: 'base',
    vec: [1, 2, 3],
    _queue_embed: true,
  };
  const collection = {
    fs_items_initialized: Date.now(),
    items: { [source.file_type]: source },
  };

  await BasesSourceContentAdapter.init_items(collection);

  t.is(source.vec, null);
  t.false(source._queue_embed);
});

test('base import removes derived links and raw source embeddings without rendering views', async t => {
  const { adapter, item } = create_adapter({
    vec: [1, 2, 3],
    queue_embed: true,
  });

  await adapter.import();

  t.deepEqual(item.data.outlinks, []);
  t.false('blocks' in item.data);
  t.deepEqual(item.data.metadata, {});
  t.is(item.data.last_import.mtime, 10);
  t.is(item.data.last_import.size, 20);
  t.is(item.vec, null);
  t.false(item._queue_embed);
  t.true(item.save_queued);
});
