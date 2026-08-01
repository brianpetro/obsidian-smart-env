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

test('reindex_embeddings persists cleared refs before deleting files and re-imports every persistent source', async (t) => {
  const calls = [];
  const source_a = {
    key: 'Notes/A.md',
    deleted: false,
    source_adapter: {},
  };
  const source_b = {
    key: 'Notes/B.md',
    deleted: false,
    source_adapter: {},
  };
  const media_source = {
    key: 'Media/Image.png',
    deleted: false,
    source_adapter: { should_persist: false },
  };
  const collection = {
    items: {
      [source_a.key]: source_a,
      [source_b.key]: source_b,
      [media_source.key]: media_source,
    },
    env: {
      _embedding_model_change_promise: Promise.resolve().then(() => {
        calls.push('model_change:complete');
      }),
      smart_vec_index_runtime: {
        unload() {
          calls.push('vec_index:unload');
        },
        async refresh_vec_index_state() {
          calls.push('vec_index:refresh');
        },
        register_vec_index_sync_events() {
          calls.push('vec_index:register');
        },
      },
    },
    entities_vector_adapter: {
      is_embed_queue_paused() { return false; },
    },
    embeddings: {
      clear_active_embedding_refs() {
        calls.push('source_refs:clear');
        return { cleared_refs: 2 };
      },
      async remove_active_vector_file() {
        calls.push('source_file:remove');
        return { removed: true };
      },
    },
    block_collection: {
      embeddings: {
        clear_active_embedding_refs() {
          calls.push('block_refs:clear');
          return { cleared_refs: 4 };
        },
        async remove_active_vector_file() {
          calls.push('block_file:remove');
          return { removed: true };
        },
      },
      async process_save_queue() {
        calls.push('block_refs:save');
      },
    },
    get_import_progress_state() { return null; },
    async process_save_queue() {
      calls.push('source_refs:save');
    },
    queue_source_re_import(source, event_meta) {
      calls.push(`source:queue:${source.key}:${event_meta.event_source}`);
    },
    async run_re_import() {
      calls.push('sources:reimport');
    },
  };

  const result = await SmartSources.prototype.reindex_embeddings.call(collection);

  t.deepEqual(calls, [
    'model_change:complete',
    'vec_index:unload',
    'source_refs:clear',
    'block_refs:clear',
    'block_refs:save',
    'source_refs:save',
    'source_file:remove',
    'block_file:remove',
    'source:queue:Notes/A.md:reindex_embeddings',
    'source:queue:Notes/B.md:reindex_embeddings',
    'sources:reimport',
    'vec_index:refresh',
  ]);
  t.deepEqual(result, {
    sources_queued: 2,
    source_refs_cleared: 2,
    block_refs_cleared: 4,
    source_file_removed: true,
    block_file_removed: true,
  });
  t.is(collection._reindex_embeddings_promise, null);
});

test('reindex_embeddings refuses to reset files during active embedding', async (t) => {
  let refs_cleared = false;
  const collection = {
    env: {},
    embeddings: {
      clear_active_embedding_refs() {
        refs_cleared = true;
      },
    },
    entities_vector_adapter: {
      _process_embed_queue_promise: Promise.resolve(),
    },
    get_import_progress_state() { return null; },
  };

  await t.throwsAsync(
    () => SmartSources.prototype.reindex_embeddings.call(collection),
    {
      message: 'Cannot re-index embeddings while source import or embedding is active or paused.',
    },
  );

  t.false(refs_cleared);
  t.is(collection._reindex_embeddings_promise, null);
});

