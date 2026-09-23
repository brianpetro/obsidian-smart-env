import test from 'ava';
import { Embeddings } from './embeddings.js';
import { cos_sim } from 'smart-utils/cos_sim.js';

const vector_cases = [
  { name: 'identical', from: [1, 0], to: [1, 0], expected: 1 },
  { name: 'opposite', from: [1, 0], to: [-1, 0], expected: -1 },
  { name: 'orthogonal', from: [1, 0], to: [0, 1], expected: 0 },
  { name: 'unnormalized', from: [2, 0], to: [3, 4], expected: 0.6 },
  { name: 'zero', from: [0, 0], to: [1, 0], expected: 0 },
  { name: 'empty', from: [], to: [], expected: 0 },
  { name: 'below epsilon', from: [1e-10, 0], to: [1, 0], expected: 0 },
];

for (const entry of vector_cases) {
  test(`cosine_similarity preserves ${entry.name} vector behavior`, (t) => {
    const embeddings = new Embeddings({});
    const from_item = { vec: entry.from };
    const to_item = { vec: entry.to };

    t.is(embeddings.cosine_similarity(from_item, to_item), entry.expected);
    t.is(embeddings.cosine_similarity(from_item, to_item), cos_sim(entry.from, entry.to));
  });
}

test('cosine_similarity accepts typed arrays and transient targets', (t) => {
  const embeddings = new Embeddings({});
  t.is(embeddings.cosine_similarity(
    { vec: new Float32Array([2, 0]) },
    { vec: new Float64Array([3, 4]) },
  ), 0.6);
});

test('cosine_similarity reads each vector once', (t) => {
  const embeddings = new Embeddings({});
  let from_reads = 0;
  let to_reads = 0;
  const from_item = { get vec() { from_reads += 1; return [1, 0]; } };
  const to_item = { get vec() { to_reads += 1; return [0, 1]; } };

  t.is(embeddings.cosine_similarity(from_item, to_item), 0);
  t.is(from_reads, 1);
  t.is(to_reads, 1);
});

test('cosine_similarity reports a missing source before reading the target', (t) => {
  const embeddings = new Embeddings({});
  let to_reads = 0;
  const to_item = { get vec() { to_reads += 1; return [1, 0]; } };
  for (const from_item of [undefined, null, {}, { vec: null }, { vec: false }]) {
    const error = t.throws(() => embeddings.cosine_similarity(from_item, to_item));
    t.is(error.code, 'MISSING_FROM_VECTOR');
    t.is(error.message, 'Missing from_item.vec');
  }
  t.is(to_reads, 0);
});

test('cosine_similarity reports a missing target with a stable error code', (t) => {
  const embeddings = new Embeddings({});
  for (const to_item of [undefined, null, {}, { vec: null }, { vec: false }]) {
    const error = t.throws(() => embeddings.cosine_similarity({ vec: [1, 0] }, to_item));
    t.is(error.code, 'MISSING_TO_VECTOR');
    t.is(error.message, 'Missing to_item.vec');
  }
});

test('cosine_similarity preserves dimension errors rather than returning an empty score', (t) => {
  const embeddings = new Embeddings({});
  const error = t.throws(() => embeddings.cosine_similarity({ vec: [1, 0] }, { vec: [1] }));
  t.is(error.message, 'Vectors must have the same length');
  t.is(error.code, undefined);
});

test('cosine_similarity preserves non-finite numerical results', (t) => {
  const embeddings = new Embeddings({});
  t.true(Number.isNaN(embeddings.cosine_similarity({ vec: [NaN, 0] }, { vec: [1, 0] })));
  t.true(Number.isNaN(embeddings.cosine_similarity({ vec: [Infinity, 0] }, { vec: [1, 0] })));
});

test('cosine_similarity propagates vector getter failures unchanged', (t) => {
  const embeddings = new Embeddings({});
  const failure = new Error('vector storage unavailable');
  const broken_item = { get vec() { throw failure; } };
  t.is(t.throws(() => embeddings.cosine_similarity(broken_item, { vec: [1, 0] })), failure);
  t.is(t.throws(() => embeddings.cosine_similarity({ vec: [1, 0] }, broken_item)), failure);
});

test('cosine_similarity uses normal stored-item ref validation', (t) => {
  const collection = {
    collection_key: 'smart_sources',
    env: { embedding_models: { default: { data: { model_key: 'test', dims: 2 } } } },
  };
  const embeddings = new Embeddings(collection);
  collection.embeddings = embeddings;
  embeddings.defer_vector_saves = true;
  const from_item = {
    key: 'source',
    collection,
    read_hash: 'current',
    data: {},
    get vec() { return collection.embeddings.get_item_vector(this); },
  };
  embeddings.set_item_vector(from_item, [1, 0]);
  t.is(embeddings.cosine_similarity(from_item, { vec: [1, 0] }), 1);
  from_item.read_hash = 'changed';
  const error = t.throws(() => embeddings.cosine_similarity(from_item, { vec: [1, 0] }));
  t.is(error.code, 'MISSING_FROM_VECTOR');
});

test('for_collection exposes cosine_similarity on a collection-owned instance', (t) => {
  const collection = { collection_key: 'smart_sources', env: {} };
  const embeddings = new Embeddings(collection.env).for_collection(collection);
  t.is(embeddings.collection, collection);
  t.is(embeddings.cosine_similarity({ vec: [1, 0] }, { vec: [1, 0] }), 1);
});
