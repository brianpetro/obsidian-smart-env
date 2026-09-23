import test from 'ava';
import { Embeddings } from './embeddings.js';

const TEST_VECTOR_FILE = 'test-vectors';
const TEST_MODEL_FINGERPRINT = 'test-model';
const TEST_VECTOR_DIMS = 2;

function create_collection(entries) {
  let candidate_vec_reads = 0;
  let filter_calls = 0;
  const refs = new Map();
  const vectors = new Float32Array(
    entries.filter((entry) => entry.vec).flatMap((entry) => entry.vec),
  );
  let next_file_i = 0;
  const items = Object.fromEntries(
    entries.map((entry) => {
      const item = {
        key: entry.key,
        read_hash: `hash:${entry.key}`,
        get vec() {
          candidate_vec_reads += 1;
          return entry.vec;
        },
        filter() {
          filter_calls += 1;
          return true;
        },
      };

      if (entry.vec) {
        refs.set(item, {
          file: entry.file || TEST_VECTOR_FILE,
          file_i: next_file_i,
          read_hash: entry.stale ? 'stale-hash' : item.read_hash,
        });
        next_file_i += 1;
      }
      return [entry.key, item];
    }),
  );
  const collection = {
    collection_key: 'smart_sources',
    env: {},
    embeddings: {
      _vectors_by_file: {
        [TEST_VECTOR_FILE]: vectors,
      },
      get_active_file_info() {
        return {
          model_fingerprint: TEST_MODEL_FINGERPRINT,
          file: TEST_VECTOR_FILE,
          dims: TEST_VECTOR_DIMS,
          value_count: vectors.length,
        };
      },
      get_item_embedding_ref(item, type, model_fingerprint) {
        if (type !== undefined || model_fingerprint !== TEST_MODEL_FINGERPRINT) {
          return null;
        }
        return refs.get(item);
      },
    },
    items,
  };

  collection.embeddings = Object.assign(new Embeddings(collection), collection.embeddings);

  return {
    collection,
    get_candidate_vec_reads() {
      return candidate_vec_reads;
    },
    get_filter_calls() {
      return filter_calls;
    },
  };
}

test('top_k uses active Float32Array vectors without reading item vec or applying filters', (t) => {
  const fixture = create_collection([
    { key: 'best', vec: [1, 0] },
    { key: 'middle', vec: [0.8, 0.6] },
    { key: 'low', vec: [0, 1] },
    { key: 'missing', vec: null },
    { key: 'stale', vec: [1, 0], stale: true },
  ]);

  const results = fixture.collection.embeddings.top_k({
    vec: new Float32Array([1, 0]),
    k: 2,
  });

  t.deepEqual(
    results.map((result) => result.item.key),
    ['best', 'middle'],
  );
  t.true(Math.abs(results[0].score - 1) < 1e-6);
  t.true(Math.abs(results[1].score - 0.8) < 1e-6);
  t.is(fixture.get_candidate_vec_reads(), 0);
  t.is(fixture.get_filter_calls(), 0);
});

test('top_k returns every valid vector when k exceeds the available population', (t) => {
  const fixture = create_collection([
    { key: 'best', vec: [1, 0] },
    { key: 'middle', vec: [0.8, 0.6] },
    { key: 'missing', vec: null },
  ]);

  const results = fixture.collection.embeddings.top_k({
    vec: new Float32Array([1, 0]),
    k: 10,
  });

  t.deepEqual(
    results.map((result) => result.item.key),
    ['best', 'middle'],
  );
});

test('top_k rejects vectors with different dimensions', (t) => {
  const fixture = create_collection([
    { key: 'best', vec: [1, 0] },
  ]);

  const error = t.throws(() => {
    fixture.collection.embeddings.top_k({
      vec: new Float32Array([1, 0, 0]),
      k: 1,
    });
  });

  t.is(error.message, 'Vectors must have the same length');
});

test('top_k returns no results for a non-positive or non-integer k', (t) => {
  const fixture = create_collection([
    { key: 'best', vec: [1, 0] },
  ]);
  const vec = new Float32Array([1, 0]);

  t.deepEqual(fixture.collection.embeddings.top_k({ vec, k: 0 }), []);
  t.deepEqual(fixture.collection.embeddings.top_k({ vec, k: 1.5 }), []);
});

test('top_k returns no results for a missing query or empty vector store', (t) => {
  const populated = create_collection([{ key: 'best', vec: [1, 0] }]);
  const empty = create_collection([]);

  t.deepEqual(populated.collection.embeddings.top_k(), []);
  t.deepEqual(populated.collection.embeddings.top_k({ vec: [], k: 1 }), []);
  t.deepEqual(empty.collection.embeddings.top_k({ vec: [1, 0], k: 1 }), []);
});

test('top_k ignores other vector files and non-finite scores but retains zero and negative scores', (t) => {
  const fixture = create_collection([
    { key: 'other-file', vec: [1, 0], file: 'other-vectors' },
    { key: 'non-finite', vec: [NaN, 0] },
    { key: 'negative', vec: [-1, 0] },
    { key: 'zero', vec: [0, 0] },
  ]);

  const results = fixture.collection.embeddings.top_k({ vec: [1, 0], k: 4 });

  t.deepEqual(results.map(({ item, score }) => [item.key, score]), [
    ['zero', 0],
    ['negative', -1],
  ]);
  t.is(fixture.get_candidate_vec_reads(), 0);
  t.is(fixture.get_filter_calls(), 0);
});

test('top_k rejects invalid refs and capacity rows beyond the active value count', (t) => {
  const fixture = create_collection([
    { key: 'valid', vec: [1, 0] },
    { key: 'outside', vec: [1, 0] },
    { key: 'negative', vec: [1, 0] },
    { key: 'fractional', vec: [1, 0] },
    { key: 'empty-hash', vec: [1, 0] },
  ]);
  const embeddings = fixture.collection.embeddings;
  const get_ref = embeddings.get_item_embedding_ref.bind(embeddings);
  const get_file_info = embeddings.get_active_file_info.bind(embeddings);
  embeddings.get_active_file_info = () => ({ ...get_file_info(), value_count: 2 });
  embeddings.get_item_embedding_ref = (item, ...args) => {
    const ref = get_ref(item, ...args);
    if (item.key === 'negative') return { ...ref, file_i: -1 };
    if (item.key === 'fractional') return { ...ref, file_i: 0.5 };
    if (item.key === 'empty-hash') return { ...ref, file_i: 0, read_hash: '' };
    return ref;
  };

  t.deepEqual(
    embeddings.top_k({ vec: [1, 0], k: 5 }).map(({ item }) => item.key),
    ['valid'],
  );
});

test('for_collection returns an Embeddings instance with top_k', (t) => {
  const fixture = create_collection([]);
  const embeddings = new Embeddings(fixture.collection.env).for_collection(fixture.collection);

  t.true(embeddings instanceof Embeddings);
  t.is(embeddings.collection, fixture.collection);
  t.is(typeof embeddings.top_k, 'function');
});
