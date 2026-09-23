import test from 'ava';
import {
  similarity,
  display_name,
  display_description,
  settings_config,
  version,
} from './similarity.js';
import { Embeddings } from '../modules/embeddings.js';
import { CollectionItem } from 'smart-collections/item.js';

const create_item = (vec) => ({ key: 'source', vec });

test('similarity retains its score metadata and settings contract', (t) => {
  t.is(similarity.action_type, 'score');
  t.is(display_name, 'Cosine Similarity');
  t.is(display_description, 'Ranks by cosine similarity between the current note and candidates.');
  t.deepEqual(settings_config, {
    similarity_algo_description: {
      group: 'Score algorithm',
      type: 'html',
      name: 'Cosine Similarity algorithm',
      value: display_description,
    },
  });
  t.is(version, '3.0.1');
});

test('similarity delegates with the owning Embeddings receiver and original items', (t) => {
  let received = null;
  const embeddings = {
    cosine_similarity(from_item, to_item) {
      received = { receiver: this, from_item, to_item };
      return 0.75;
    },
  };
  const from_item = {
    collection: { embeddings },
    get vec() { throw new Error('the action must not materialize this vector'); },
  };
  const to_item = { get vec() { throw new Error('the action must not materialize this vector'); } };

  t.deepEqual(similarity.call(from_item, { to_item }), { score: 0.75 });
  t.deepEqual(received, { receiver: embeddings, from_item, to_item });
});

test('similarity supports direct calls on plain vector-bearing objects', (t) => {
  t.deepEqual(similarity.call(create_item([2, 0]), { to_item: { vec: [3, 4] } }), { score: 0.6 });
});

test('similarity keeps a Core fallback for older modules without the new method', (t) => {
  const from_item = { ...create_item([1, 0]), collection: { embeddings: {} } };
  t.deepEqual(similarity.call(from_item, { to_item: { vec: [-1, 0] } }), { score: -1 });
});

test('similarity preserves exact missing-vector result strings and source precedence', (t) => {
  t.deepEqual(similarity.call(create_item(undefined), { to_item: {} }), {
    score: null,
    error: 'Missing this.vec for source',
  });
  for (const to_item of [undefined, null, {}, { vec: null }]) {
    t.deepEqual(similarity.call(create_item([1, 0]), { to_item }), {
      score: null,
      error: 'Missing params.to_item.vec',
    });
  }
});

test('similarity translates codes from independently bundled Embeddings implementations', (t) => {
  for (const [code, message] of [
    ['MISSING_FROM_VECTOR', 'Missing this.vec for source'],
    ['MISSING_TO_VECTOR', 'Missing params.to_item.vec'],
  ]) {
    const embeddings = {
      cosine_similarity() {
        throw Object.assign(new Error('backend detail'), { code });
      },
    };
    const from_item = { key: 'source', collection: { embeddings } };
    t.deepEqual(similarity.call(from_item, { to_item: {} }), { score: null, error: message });
  }
});

test('similarity uses Core Embeddings and preserves zero, empty and non-finite scores', (t) => {
  const collection = { collection_key: 'smart_sources', env: {} };
  collection.embeddings = new Embeddings(collection);
  for (const [from_vec, to_vec, expected] of [
    [[0, 0], [1, 0], 0],
    [[], [], 0],
    [[-1, 0], [1, 0], -1],
  ]) {
    t.deepEqual(similarity.call({ collection, vec: from_vec }, { to_item: { vec: to_vec } }), { score: expected });
  }
  const result = similarity.call({ collection, vec: [NaN, 0] }, { to_item: { vec: [1, 0] } });
  t.true(Number.isNaN(result.score));
  t.deepEqual(Object.keys(result), ['score']);
});

test('similarity does not swallow dimension, storage or unrelated backend errors', (t) => {
  const dimension_error = t.throws(() => similarity.call(create_item([1, 0]), { to_item: { vec: [1] } }));
  t.is(dimension_error.message, 'Vectors must have the same length');
  const failure = new Error('backend failure');
  const embeddings = { cosine_similarity() { throw failure; } };
  t.is(t.throws(() => similarity.call({ collection: { embeddings } }, { to_item: {} })), failure);
  t.is(t.throws(() => similarity.call({ get vec() { throw failure; } }, { to_item: {} })), failure);
});

test('CollectionItem.score retains dynamic dispatch and adds the original item', (t) => {
  const item = create_item([1, 0]);
  item.actions = { similarity: similarity.bind(item) };
  const result = CollectionItem.prototype.score.call(item, {
    score_algo_key: 'similarity',
    to_item: { vec: [0, 1] },
  });
  t.deepEqual(result, { score: 0, item });
});
