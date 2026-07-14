import test from 'ava';
import { BasesSourceContentAdapter } from './bases.js';

const create_adapter = () => {
  const item = {
    data: {
      outlinks: [{ target: 'Cached result' }],
    },
    env: { settings: { smart_sources: {} } },
    collection: { fs: {} },
    file: { stat: { mtime: 10, size: 20 } },
    queue_save() { this.save_queued = true; },
  };

  return {
    adapter: new BasesSourceContentAdapter(item),
    item,
  };
};

test('base import removes derived Bases links without rendering views', async t => {
  const { adapter, item } = create_adapter();

  await adapter.import();

  t.deepEqual(item.data.outlinks, []);
  t.false('blocks' in item.data);
  t.deepEqual(item.data.metadata, {});
  t.is(item.data.last_import.mtime, 10);
  t.is(item.data.last_import.size, 20);
  t.true(item.save_queued);
});
