import test from 'ava';
import { LookupList } from './lookup_list.js';

function create_lookup_list(
  scored_results,
  {
    freeze_results = false,
  } = {},
) {
  const items = Object.fromEntries(
    scored_results.map(({ key, score }) => {
      const item = {
        key,
        filter_and_score() {
          const result = {
            item,
            score,
          };

          return freeze_results
            ? Object.freeze(result)
            : result
          ;
        },
      };

      return [key, item];
    }),
  );
  const lookup_list = Object.create(LookupList.prototype);
  lookup_list.env = {
    smart_sources: {
      items,
    },
  };

  return lookup_list;
}

test('filter_and_score keeps only the highest results at the requested limit', (t) => {
  const lookup_list = create_lookup_list([
    { key: 'low', score: 0.1 },
    { key: 'middle', score: 0.2 },
    { key: 'high', score: 0.3 },
  ]);

  const results = lookup_list.filter_and_score({
    results_collection_key: 'smart_sources',
    limit: 2,
  });

  t.deepEqual(
    results.map((result) => result.item.key),
    ['high', 'middle'],
  );
  t.is(results.length, 2);
});

test('filter_and_score returns the highest all-negative results without normalization', (t) => {
  const lookup_list = create_lookup_list([
    { key: 'lowest', score: -0.9 },
    { key: 'middle', score: -0.8 },
    { key: 'highest', score: -0.1 },
  ], {
    freeze_results: true,
  });

  const results = lookup_list.filter_and_score({
    results_collection_key: 'smart_sources',
    limit: 2,
  });

  t.deepEqual(
    results.map((result) => result.item.key),
    ['highest', 'middle'],
  );
  t.deepEqual(
    results.map((result) => result.score),
    [-0.1, -0.8],
  );
});

test('filter_and_score retains zero scores when no score is positive', (t) => {
  const lookup_list = create_lookup_list([
    { key: 'lowest', score: -0.9 },
    { key: 'middle', score: -0.1 },
    { key: 'highest', score: 0 },
  ], {
    freeze_results: true,
  });

  const results = lookup_list.filter_and_score({
    results_collection_key: 'smart_sources',
    limit: 2,
  });

  t.deepEqual(
    results.map((result) => result.item.key),
    ['highest', 'middle'],
  );
  t.deepEqual(
    results.map((result) => result.score),
    [0, -0.1],
  );
});

test('get_results includes the query in the lookup event', async (t) => {
  const query = 'Inspect this lookup query';
  const emitted_events = [];
  const lookup_list = {
    env: {},
    should_post_process: false,
    async pre_process() {},
    filter_and_score() {
      return [];
    },
    emit_event(event_key, payload) {
      emitted_events.push({ event_key, payload });
    },
  };

  const results = await LookupList.prototype.get_results.call(lookup_list, {
    query,
  });

  t.deepEqual(results, []);
  t.deepEqual(emitted_events, [{
    event_key: 'lookup:get_results',
    payload: { query },
  }]);
});
