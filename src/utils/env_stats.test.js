import test from 'ava';
import {
  collect_collection_stats,
  collect_environment_stats,
  has_current_embedding,
} from './env_stats.js';

const MODEL_FINGERPRINT = 'mf_current';
const DIMS = 3;

function create_embeddings(value_count = 6) {
  let file_info_reads = 0;
  return {
    get file_info_reads() {
      return file_info_reads;
    },
    get_active_file_info() {
      file_info_reads += 1;
      return {
        model_fingerprint: MODEL_FINGERPRINT,
        file: MODEL_FINGERPRINT,
        dims: DIMS,
        value_count,
      };
    },
  };
}

function create_item({
  key,
  should_embed,
  read_hash,
  ref = null,
  queued = false,
}) {
  let should_embed_reads = 0;
  const item = {
    key,
    data: {
      last_read: {
        hash: read_hash,
      },
      embedding: ref
        ? {
          default: {
            [MODEL_FINGERPRINT]: ref,
          },
        }
        : {},
    },
    _queue_embed: queued,
    get should_embed() {
      should_embed_reads += 1;
      return should_embed;
    },
    get should_embed_reads() {
      return should_embed_reads;
    },
  };
  Object.defineProperty(item, 'vec', {
    get() {
      throw new Error('stats must not resolve item.vec');
    },
  });
  Object.defineProperty(item, 'read_hash', {
    get() {
      throw new Error('stats should reuse the already-read item.data');
    },
  });
  return item;
}

function create_current_ref(file_i, read_hash) {
  return {
    file: MODEL_FINGERPRINT,
    file_i,
    read_hash,
    at: 1,
  };
}

test('collect_collection_stats scans each item once without resolving vectors', async t => {
  const embeddings = create_embeddings();
  const items = {
    current: create_item({
      key: 'current',
      should_embed: true,
      read_hash: 'hash-current',
      ref: create_current_ref(0, 'hash-current'),
    }),
    missing: create_item({
      key: 'missing',
      should_embed: true,
      read_hash: 'hash-new',
      ref: create_current_ref(1, 'hash-old'),
      queued: true,
    }),
    skipped: create_item({
      key: 'skipped',
      should_embed: false,
      read_hash: 'hash-skipped',
    }),
    unexpected: create_item({
      key: 'unexpected',
      should_embed: false,
      read_hash: 'hash-unexpected',
      ref: create_current_ref(1, 'hash-unexpected'),
    }),
  };
  const collection = {
    collection_key: 'smart_blocks',
    items,
    embeddings,
    load_time_ms: 12,
  };

  const stats = await collect_collection_stats(collection, {
    state: 'loaded',
    yield_after_ms: Number.POSITIVE_INFINITY,
  });

  t.like(stats, {
    state: 'loaded',
    total_items: 4,
    scanned_items: 4,
    should_embed: 2,
    should_not_embed: 2,
    vectorized: 2,
    embedded: 1,
    missing_embed: 1,
    extraneous_embed: 1,
    queued: 1,
    coverage_percent: 50,
    load_time_ms: 12,
    cancelled: false,
  });
  t.is(embeddings.file_info_reads, 1);
  Object.values(items).forEach((item) => {
    t.is(item.should_embed_reads, 1);
  });
});

test('collect_environment_stats aggregates loaded collections', async t => {
  const source_embeddings = create_embeddings(3);
  const block_embeddings = create_embeddings(3);
  const env = {
    collections: {
      smart_sources: 'loaded',
      smart_blocks: 'loaded',
    },
    smart_sources: {
      collection_key: 'smart_sources',
      embeddings: source_embeddings,
      items: {
        source: create_item({
          key: 'source',
          should_embed: true,
          read_hash: 'source-hash',
          ref: create_current_ref(0, 'source-hash'),
        }),
      },
    },
    smart_blocks: {
      collection_key: 'smart_blocks',
      embeddings: block_embeddings,
      items: {
        block: create_item({
          key: 'block',
          should_embed: true,
          read_hash: 'block-hash',
        }),
      },
    },
  };

  const result = await collect_environment_stats(env, {
    yield_after_ms: Number.POSITIVE_INFINITY,
  });

  t.like(result.totals, {
    total_items: 2,
    scanned_items: 2,
    should_embed: 2,
    embedded: 1,
    missing_embed: 1,
    coverage_percent: 50,
  });
  t.is(result.collections.length, 2);
  t.false(result.cancelled);
});

test('has_current_embedding supports legacy refs without mutating them', t => {
  const embeddings = create_embeddings(3);
  const legacy_ref = create_current_ref(0, 'legacy-hash');
  const item = {
    data: {
      last_read: {
        hash: 'legacy-hash',
      },
      embedding: {
        default: legacy_ref,
      },
    },
  };

  t.true(has_current_embedding(item, embeddings));
  t.is(item.data.embedding.default, legacy_ref);
  t.false(Object.hasOwn(item.data.embedding.default, MODEL_FINGERPRINT));
});

test('has_current_embedding accepts a non-mutating current hash override', t => {
  const embeddings = create_embeddings(3);
  const item = {
    data: {
      last_read: {
        hash: 'persisted-old-hash',
      },
      embedding: {
        default: {
          [MODEL_FINGERPRINT]: create_current_ref(0, 'current-content-hash'),
        },
      },
    },
  };

  t.false(has_current_embedding(item, embeddings));
  t.true(has_current_embedding(
    item,
    embeddings,
    null,
    'current-content-hash',
  ));
  t.is(item.data.last_read.hash, 'persisted-old-hash');
});

test('unloaded collections do not evaluate expensive item getters', async t => {
  let should_embed_reads = 0;
  const collection = {
    collection_key: 'smart_blocks',
    items: {
      block: {
        get should_embed() {
          should_embed_reads += 1;
          return true;
        },
      },
    },
  };

  const stats = await collect_collection_stats(collection, {
    state: 'init',
  });

  t.is(stats.total_items, 1);
  t.is(stats.scanned_items, 0);
  t.is(should_embed_reads, 0);
});
