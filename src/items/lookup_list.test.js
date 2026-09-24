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
    actions: {},
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


test('Lookup does not run saved post-processing actions', async t => {
  const results = [];
  const scope = {
    env: {},
    settings: { lookup_post_process: 'chat_rank' },
    should_post_process: true,
    actions: {},
    filter_and_score() { return results; },
    async post_process() { t.fail('Lookup must not run a post-processing action.'); },
    emit_event() {},
  };
  t.is(await LookupList.prototype.get_results.call(scope, { query: 'test' }), results);
});

for (const query of [undefined, 'Original UI query']) {
  test(`document retrieval events retain only actual scope query context: ${query}`, async t => {
    const events = [];
    const scope = {
      env: {},
      data: query === undefined ? {} : { query },
      actions: {},
      filter_and_score() { return []; },
      emit_event(key, payload) { events.push({ key, payload }); },
    };
    await LookupList.prototype.get_results.call(scope, {
      embed_request: { embed_input: 'Prepared document text', purpose: 'document' },
    });
    t.deepEqual(events, [{ key: 'lookup:get_results', payload: { query } }]);
  });
}


test('Retained results are item-local runtime state and retrieval passes do not replace them', async t => {
  const env = {
    create_env_getter() {},
    lookup_lists: { item_class_name: 'LookupList' },
  };
  const lookup_list = new LookupList(env, { key: 'first', query: 'first query' });
  const other_list = new LookupList(env, { key: 'second', query: 'second query' });
  t.is(lookup_list.results, null);
  const retained_results = [{ item: { key: 'Retained.md' }, score: 0.8 }];
  lookup_list.results = retained_results;
  t.is(other_list.results, null);
  t.false(Object.hasOwn(lookup_list.data, 'results'));
  t.is(lookup_list.data.query, 'first query');

  const pass_results = [{ item: { key: 'Intermediate.md' }, score: 0.9 }];
  lookup_list._actions = {};
  lookup_list.filter_and_score = () => pass_results;
  lookup_list.emit_event = () => {};
  t.is(await lookup_list.get_results({ query: 'first query' }), pass_results);
  t.is(lookup_list.results, retained_results);
});

test('get_results awaits the registered preparation with Lookup scope and the original params', async t => {
  const lookup_list = create_lookup_list([]);
  const params = { query: 'test query' };
  const target = { vec: [1, 0] };
  const results = [];
  const events = [];
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let preparations = 0;
  let retrievals = 0;
  lookup_list.env.opts = {};
  lookup_list.env.config = {
    actions: {
      lookup_list_pre_process: {
        async action(next_params) {
          t.is(this, lookup_list);
          t.is(next_params, params);
          preparations++;
          await ready;
          next_params.to_item = target;
        },
      },
    },
  };
  lookup_list.filter_and_score = next_params => {
    t.is(next_params, params);
    t.is(next_params.to_item, target);
    retrievals++;
    return results;
  };
  lookup_list.emit_event = (key, payload) => events.push({ key, payload });

  const pending = lookup_list.get_results(params);
  t.is(preparations, 1);
  t.is(retrievals, 0);
  t.deepEqual(events, []);
  release();

  t.is(await pending, results);
  t.is(preparations, 1);
  t.is(retrievals, 1);
  t.deepEqual(events, [{ key: 'lookup:get_results', payload: { query: params.query } }]);
  t.false('pre_process' in lookup_list);
});

test('get_results propagates preparation failure without scoring or emitting a success event', async t => {
  const error = new Error('embedding failed');
  const scope = {
    actions: {
      async lookup_list_pre_process() { throw error; },
    },
    filter_and_score() { t.fail('scoring must wait for preparation'); },
    emit_event() { t.fail('failed preparation must not emit a retrieval event'); },
  };

  t.is(await t.throwsAsync(() => LookupList.prototype.get_results.call(scope, { query: 'test' })), error);
});
