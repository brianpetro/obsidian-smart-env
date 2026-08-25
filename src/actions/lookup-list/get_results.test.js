import test from 'ava';
import {
  action_scope,
  lookup_list_get_results,
  output_schema,
  project_lookup_list_request,
  project_lookup_list_result,
  tool,
} from './get_results.js';
import { LookupLists } from '../../collections/lookup_lists.js';

function create_lookup_lists_fixture() {
  class TestLookupList {
    constructor(env, data) {
      this.env = env;
      this.data = data;
    }

    get key() {
      return this.data.key;
    }
  }

  const env = {};
  const lookup_lists = Object.create(LookupLists.prototype);
  lookup_lists.env = env;
  lookup_lists.items = {};
  lookup_lists._item_type = TestLookupList;
  env.lookup_lists = lookup_lists;

  return {
    env,
    lookup_lists,
  };
}

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

test('project_lookup_list_request creates a fresh unregistered scope', (t) => {
  const {
    env,
    lookup_lists,
  } = create_lookup_lists_fixture();

  const first = project_lookup_list_request(
    {
      query: '  project alpha  ',
      include_content: true,
    },
    { env },
  );
  const second = project_lookup_list_request(
    {
      query: 'project alpha',
    },
    { env },
  );

  t.deepEqual(first.params, {
    query: 'project alpha',
  });
  t.is(first.scope.data.query, 'project alpha');
  t.not(first.scope, second.scope);
  t.deepEqual(lookup_lists.items, {});

  const registered = lookup_lists.new_item({
    query: 'project alpha',
  });
  const registered_items = { ...lookup_lists.items };
  const third = project_lookup_list_request(
    {
      query: 'project alpha',
    },
    { env },
  );

  t.not(third.scope, registered);
  t.deepEqual(lookup_lists.items, registered_items);
});

test('project_lookup_list_result returns the stable public payload', async (t) => {
  const scope = {
    key: '2026-08-20+alpha',
    data: {
      query: 'project alpha',
    },
  };
  const raw_results = [
    {
      item: {
        key: 'Notes/Alpha.md',
        collection_key: 'smart_sources',
      },
      score: 0.9,
    },
  ];

  t.deepEqual(
    await project_lookup_list_result(
      raw_results,
      {
        scope,
        params: {
          query: 'project alpha',
        },
      },
    ),
    {
      ok: true,
      key: '2026-08-20+alpha',
      query: 'project alpha',
      total: 1,
      results: [
        {
          key: 'Notes/Alpha.md',
          collection_key: 'smart_sources',
          score: 0.9,
        },
      ],
    },
  );
  t.is(raw_results[0].item.key, 'Notes/Alpha.md');
});

test('project_lookup_list_result includes item content when requested', async (t) => {
  let read_count = 0;
  const scope = {
    key: '2026-08-20+alpha',
    data: {
      query: 'project alpha',
    },
  };
  const raw_results = [
    {
      item: {
        key: 'Notes/Alpha.md#Summary',
        collection_key: 'smart_blocks',
        async read() {
          read_count += 1;
          return '## Summary\n\nLookup content.';
        },
      },
      score: 0.9,
    },
  ];

  const result = await project_lookup_list_result(
    raw_results,
    {
      scope,
      request: {
        include_content: true,
      },
      params: {
        query: 'project alpha',
      },
    },
  );

  t.is(read_count, 1);
  t.deepEqual(result.results[0], {
    key: 'Notes/Alpha.md#Summary',
    collection_key: 'smart_blocks',
    score: 0.9,
    content: '## Summary\n\nLookup content.',
  });
});

test('lookup tool metadata targets LookupList and clears the direct schema', (t) => {
  t.deepEqual(action_scope, {
    type: 'item',
    collection_key: 'lookup_lists',
    item_arg: 'key',
  });
  t.is(output_schema, null);
  t.is(tool.project_request, project_lookup_list_request);
  t.is(tool.project_result, project_lookup_list_result);
  t.deepEqual(tool.input_schema.required, ['query']);
  t.is(tool.input_schema.properties.include_content.type, 'boolean');
  t.is(
    tool.output_schema.properties.results.items.properties.content.type,
    'string',
  );
  t.deepEqual(tool.output_schema.required, [
    'ok',
    'key',
    'query',
    'total',
    'results',
  ]);
});
