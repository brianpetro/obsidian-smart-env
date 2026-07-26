import test from 'ava';
import { SmartSources } from './smart_sources.js';

test('deleted source tombstones enter the adapter write chain immediately', async (t) => {
  let append_started = false;
  let finish_append;
  const append_finished = new Promise((resolve) => {
    finish_append = resolve;
  });
  const collection = {
    collection_key: 'smart_sources',
    data_adapter: {
      append_sources(sources) {
        append_started = true;
        t.is(sources.length, 1);
        t.true(sources[0].deleted);
        t.is(sources[0].key, 'Notes/Deleted.md');
        return append_finished;
      },
    },
    get() {
      return null;
    },
  };

  SmartSources.prototype.queue_deleted_source_tombstone.call(collection, 'Notes/Deleted.md');

  t.true(append_started);
  finish_append();
  await collection._deleted_source_tombstone_promise;
});
