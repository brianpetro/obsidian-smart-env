import test from 'ava';
import { top_k } from './top_k.js';

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

  const results = top_k.call(fixture.collection, {
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

  const results = top_k.call(fixture.collection, {
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
    top_k.call(fixture.collection, {
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

  t.deepEqual(top_k.call(fixture.collection, { vec, k: 0 }), []);
  t.deepEqual(top_k.call(fixture.collection, { vec, k: 1.5 }), []);
});
