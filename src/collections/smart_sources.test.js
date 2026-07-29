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

test('embed_queue excludes deselected blocks with stale queue flags', (t) => {
  const parent = {
    key: 'Notes/Test.md#Parent',
    _queue_embed: true,
    should_embed: false,
  };
  const child = {
    key: 'Notes/Test.md#Parent#{1}',
    _queue_embed: false,
    should_embed: true,
  };
  const source = {
    key: 'Notes/Test.md',
    _queue_embed: false,
    should_embed: false,
    blocks: [parent, child],
  };
  const vector_checks = [];
  const collection = {
    _embed_queue_ready: false,
    _embed_queue: [],
    items: {
      [source.key]: source,
    },
    embeddings: {
      get_active_file_info() { return {}; },
      has_current_vector_ref() { return false; },
    },
    block_collection: {
      settings: { embed_blocks: true },
      embeddings: {
        get_active_file_info() { return {}; },
        has_current_vector_ref(block) {
          vector_checks.push(block.key);
          return false;
        },
      },
    },
  };
  const get_embed_queue = Object.getOwnPropertyDescriptor(
    SmartSources.prototype,
    'embed_queue',
  ).get;

  const embed_queue = get_embed_queue.call(collection);

  t.deepEqual(embed_queue.map((item) => item.key), [child.key]);
  t.false(parent._queue_embed);
  t.deepEqual(vector_checks, [child.key]);
});
