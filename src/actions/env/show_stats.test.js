import test from 'ava';
import {
  collect_collection_inspection_records,
  collect_collection_stats,
  repair_block_embedding_integrity,
} from './show_stats.js';

const MODEL_FINGERPRINT = 'model-a';
const VECTOR_FILE = 'vectors-a';

function create_embeddings() {
  return {
    get_active_file_info() {
      return {
        model_fingerprint: MODEL_FINGERPRINT,
        file: VECTOR_FILE,
        dims: 2,
        value_count: 100,
      };
    },
  };
}

function create_item(params = {}) {
  const key = params.key || 'item.md';
  const hash = params.hash || key;
  const file_i = params.file_i || 0;
  const vectorized = params.vectorized || false;
  const data = {
    last_read: {
      hash,
      size: params.size,
    },
  };
  if (vectorized) {
    data.embedding = {
      default: {
        [MODEL_FINGERPRINT]: {
          file: VECTOR_FILE,
          file_i,
          read_hash: hash,
        },
      },
    };
  }

  return {
    key,
    should_embed: params.should_embed ?? false,
    size: params.size,
    file_type: params.file_type || 'md',
    is_gone: params.is_gone || false,
    source_adapter: params.source_adapter,
    source_key: params.source_key,
    line_start: params.line_start,
    line_end: params.line_end,
    data,
  };
}

function reasons_by_key(result) {
  return Object.fromEntries(result.reasons.map((reason) => [reason.key, reason]));
}

test('skipped inspection explains all ineligible sources and marks unexpected vectors as a subset', async (t) => {
  const collection = {
    collection_key: 'smart_sources',
    settings: {
      min_chars: 300,
    },
    embeddings: create_embeddings(),
    items: {
      eligible: create_item({
        key: 'eligible.md',
        should_embed: true,
        size: 800,
        vectorized: true,
      }),
      below_minimum: create_item({
        key: 'below-minimum.md',
        size: 120,
      }),
      below_minimum_unexpected: create_item({
        key: 'below-minimum-unexpected.md',
        size: 180,
        vectorized: true,
        file_i: 1,
      }),
      excluded_type: create_item({
        key: 'excluded.base',
        file_type: 'base',
        size: 1000,
        vectorized: true,
        file_i: 2,
        source_adapter: {
          should_embed: false,
        },
      }),
      unavailable: create_item({
        key: 'missing.md',
        is_gone: true,
        size: 0,
      }),
      current_policy: create_item({
        key: 'policy.md',
        size: 1000,
      }),
    },
  };

  const result = await collect_collection_inspection_records(collection, {
    status: 'skipped',
    yield_after_ms: Number.POSITIVE_INFINITY,
  });
  const reasons = reasons_by_key(result);

  t.is(result.records.length, 5);
  t.deepEqual(result.status_counts, {
    skipped: 3,
    unexpected: 2,
  });
  t.deepEqual(
    result.records.map((record) => record.key),
    [
      'below-minimum-unexpected.md',
      'below-minimum.md',
      'excluded.base',
      'missing.md',
      'policy.md',
    ],
  );
  t.is(reasons.below_minimum_size.count, 2);
  t.is(reasons.source_type_excluded.count, 1);
  t.is(reasons.source_unavailable.count, 1);
  t.is(reasons.current_policy.count, 1);
  t.true(
    result.records.find((record) => record.key === 'excluded.base')
      .reason_detail.includes('.base'),
  );
  t.is(
    result.records.find((record) => record.key === 'below-minimum-unexpected.md')
      .status_key,
    'unexpected',
  );
});

test('unexpected inspection returns only ineligible items with a current vector', async (t) => {
  const collection = {
    collection_key: 'smart_sources',
    settings: {
      min_chars: 300,
    },
    embeddings: create_embeddings(),
    items: {
      skipped: create_item({
        key: 'skipped.md',
        size: 100,
      }),
      unexpected: create_item({
        key: 'unexpected.md',
        size: 100,
        vectorized: true,
      }),
      current: create_item({
        key: 'current.md',
        should_embed: true,
        size: 1000,
        vectorized: true,
        file_i: 1,
      }),
    },
  };

  const result = await collect_collection_inspection_records(collection, {
    status: 'unexpected',
    yield_after_ms: Number.POSITIVE_INFINITY,
  });

  t.deepEqual(result.records.map((record) => record.key), ['unexpected.md']);
  t.deepEqual(result.status_counts, {
    skipped: 0,
    unexpected: 1,
  });
  t.is(result.reasons[0].key, 'below_minimum_size');
});

test('block inspection distinguishes minimum-size skips from coverage-plan skips', async (t) => {
  const collection = {
    collection_key: 'smart_blocks',
    settings: {
      min_chars: 100,
    },
    embeddings: create_embeddings(),
    items: {
      later_block: create_item({
        key: 'b.md#Later',
        source_key: 'b.md',
        size: 300,
        line_start: 20,
        line_end: 24,
      }),
      exact_minimum: create_item({
        key: 'a.md#Exact',
        source_key: 'a.md',
        size: 100,
        line_start: 10,
        line_end: 12,
      }),
      below_minimum: create_item({
        key: 'a.md#Small',
        source_key: 'a.md',
        size: 99,
        line_start: 2,
        line_end: 4,
        vectorized: true,
      }),
    },
  };

  const result = await collect_collection_inspection_records(collection, {
    status: 'skipped',
    yield_after_ms: Number.POSITIVE_INFINITY,
  });

  t.deepEqual(
    result.records.map((record) => record.key),
    ['a.md#Small', 'a.md#Exact', 'b.md#Later'],
  );
  t.is(result.records[0].reason_key, 'below_minimum_size');
  t.is(result.records[0].status_key, 'unexpected');
  t.is(result.records[1].reason_key, 'block_coverage_plan');
  t.is(result.records[2].reason_key, 'block_coverage_plan');
  t.is(result.records[0].line_start, 2);
  t.is(result.records[0].line_end, 4);
});

test('inspection rejects unsupported statuses', async (t) => {
  await t.throwsAsync(
    collect_collection_inspection_records({}, { status: 'missing' }),
    {
      instanceOf: TypeError,
      message: 'Unsupported collection inspection status: missing',
    },
  );
});

test('block stats flag sources whose active embedding refs share a vector row', async (t) => {
  const source_a = { key: 'a.md' };
  const source_b = { key: 'b.md' };
  const source_c = { key: 'c.md' };
  const collection = {
    collection_key: 'smart_blocks',
    embeddings: create_embeddings(),
    items: {
      a_first: create_item({
        key: 'a.md#First',
        source_key: source_a.key,
        vectorized: true,
        file_i: 3,
      }),
      a_second: create_item({
        key: 'a.md#Second',
        source_key: source_a.key,
        vectorized: true,
        file_i: 4,
      }),
      b_first: create_item({
        key: 'b.md#First',
        source_key: source_b.key,
        vectorized: true,
        file_i: 3,
      }),
      c_first: create_item({
        key: 'c.md#First',
        source_key: source_c.key,
        vectorized: true,
        file_i: 4,
      }),
      unique: create_item({
        key: 'c.md#Unique',
        source_key: source_c.key,
        vectorized: true,
        file_i: 5,
      }),
    },
  };
  collection.items.unique.data.embedding.default[MODEL_FINGERPRINT].file = 'vectors-old';

  const stats = await collect_collection_stats(collection, {
    collection_key: 'smart_blocks',
    state: 'loaded',
    yield_after_ms: Number.POSITIVE_INFINITY,
  });

  t.is(stats.embedding_integrity.duplicate_ref_count, 2);
  t.is(stats.embedding_integrity.duplicate_block_count, 4);
  t.deepEqual(
    stats.embedding_integrity.sources.map((record) => ({
      source_key: record.source_key,
      block_count: record.block_count,
    })),
    [
      { source_key: 'a.md', block_count: 2 },
      { source_key: 'b.md', block_count: 1 },
      { source_key: 'c.md', block_count: 1 },
    ],
  );
});

test('embedding integrity repair clears shared refs and re-imports flagged sources once', async (t) => {
  const calls = [];
  const source_a = { key: 'a.md' };
  const source_b = { key: 'b.md' };
  const first = create_item({
    key: 'a.md#First',
    source_key: source_a.key,
    vectorized: true,
    file_i: 9,
  });
  const second = create_item({
    key: 'b.md#Second',
    source_key: source_b.key,
    vectorized: true,
    file_i: 9,
  });
  const unique = create_item({
    key: 'b.md#Unique',
    source_key: source_b.key,
    vectorized: true,
    file_i: 10,
  });
  const embeddings = create_embeddings();
  embeddings.set_item_vector = (item, vec) => {
    t.is(vec, null);
    calls.push(`clear:${item.key}`);
    delete item.data.embedding.default[MODEL_FINGERPRINT];
  };
  const block_collection = {
    collection_key: 'smart_blocks',
    embeddings,
    items: { first, second, unique },
  };
  const env = {
    smart_blocks: block_collection,
    smart_sources: {
      get(source_key) {
        return source_key === source_a.key ? source_a : source_b;
      },
      queue_source_re_import(source) {
        calls.push(`queue:${source.key}`);
      },
      async run_re_import() {
        calls.push('run');
      },
    },
  };

  const result = await repair_block_embedding_integrity(env);

  t.deepEqual(result, {
    cleared_block_refs: 2,
    reimported_sources: 2,
  });
  t.deepEqual(calls, [
    'clear:a.md#First',
    'clear:b.md#Second',
    'queue:a.md',
    'queue:b.md',
    'run',
  ]);
  t.truthy(unique.data.embedding.default[MODEL_FINGERPRINT]);
});

test('embedding integrity repair validates source re-import before clearing refs', async (t) => {
  const source_a = { key: 'a.md' };
  const source_b = { key: 'b.md' };
  const cleared = [];
  const embeddings = create_embeddings();
  embeddings.set_item_vector = (item) => cleared.push(item);

  await t.throwsAsync(
    repair_block_embedding_integrity({
      smart_blocks: {
        collection_key: 'smart_blocks',
        embeddings,
        items: {
          first: create_item({
            key: 'a.md#First',
            source_key: source_a.key,
            vectorized: true,
            file_i: 11,
          }),
          second: create_item({
            key: 'b.md#Second',
            source_key: source_b.key,
            vectorized: true,
            file_i: 11,
          }),
        },
      },
      smart_sources: {},
    }),
    { message: 'Source re-import is unavailable' },
  );
  t.deepEqual(cleared, []);
});
