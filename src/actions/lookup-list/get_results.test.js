import test from 'ava';
import { lookup_list_get_results } from './get_results.js';

test('lookup_list_get_results delegates params and preserves results', async (t) => {
  const params = { query: 'semantic lookup' };
  const expected_results = [
    { item: { key: 'Notes/Result.md' }, score: 0.91 },
  ];
  let received_params = null;
  const scope = {
    async get_results(next_params) {
      received_params = next_params;
      return expected_results;
    },
  };

  const results = await lookup_list_get_results.call(scope, params);

  t.is(received_params, params);
  t.is(results, expected_results);
});

test('lookup_list_get_results runs the selected retrieval action', async (t) => {
  const params = { query: 'semantic lookup' };
  const expected_results = [
    { item: { key: 'Notes/HyDE Result.md' }, score: 1.42 },
  ];
  let received_params = null;
  const scope = {
    settings: {
      get_results_action_key: 'lookup_list_get_results_hyde',
    },
    actions: {
      async lookup_list_get_results_hyde(next_params) {
        received_params = next_params;
        return expected_results;
      },
    },
    async get_results() {
      t.fail('The default retrieval method should not run.');
    },
  };

  const results = await lookup_list_get_results.call(scope, params);

  t.is(received_params, params);
  t.is(results, expected_results);
});
