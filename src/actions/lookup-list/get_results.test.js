import test from 'ava';
import { pre_process } from './pre_process.js';
import { collection_tool_action_schemas } from '../../utils/collection_tool_action_schemas.js';
import {
  action_scope,
  input_schema,
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

  const env = { smart_sources: {}, smart_blocks: {} };
  const lookup_lists = Object.create(LookupLists.prototype);
  lookup_lists.env = env;
  lookup_lists.items = {};
  lookup_lists._item_type = TestLookupList;
  env.lookup_lists = lookup_lists;
  Object.defineProperty(lookup_lists, 'results_collection_key', { value: 'smart_sources', configurable: true });

  return {
    env,
    lookup_lists,
  };
}

test('lookup_list_get_results uses query input and does not mutate caller params', async (t) => {
  const { env } = create_lookup_lists_fixture();
  const params = Object.freeze({ query: 'semantic lookup' });
  const expected_results = [{ item: { key: 'Notes/Result.md' }, score: 0.91 }];
  let received_params;
  const scope = {
    env,
    settings: {},
    async get_results(next_params) {
      received_params = next_params;
      return expected_results;
    },
  };
  t.is(await lookup_list_get_results.call(scope, params), expected_results);
  t.not(received_params, params);
  t.deepEqual(received_params, {
    query: params.query,
    results_collection_key: 'smart_sources',
    limit: 20,
    embed_request: { embed_input: params.query, purpose: 'query' },
  });
});

for (const action_key of ['lookup_list_get_results_hyde', 'lookup_list_get_results_missing']) {
  test(`lookup ignores the obsolete strategy setting: ${action_key}`, async (t) => {
    const { env } = create_lookup_lists_fixture();
    const results = [];
    const scope = {
      env,
      settings: { get_results_action_key: action_key },
      actions: { [action_key]() { t.fail('Saved strategy must not run.'); } },
      async get_results(params) {
        t.deepEqual(params.embed_request, { embed_input: 'query', purpose: 'query' });
        return results;
      },
    };
    t.is(await lookup_list_get_results.call(scope, { query: 'query' }), results);
  });
}

test('project_lookup_list_request creates a fresh unregistered scope', (t) => {
  const {
    env,
    lookup_lists,
  } = create_lookup_lists_fixture();

  const filter = {
    exclude_keys: ['Notes/Ignored.md'],
    key_starts_with: 'Notes/',
  };
  const first = project_lookup_list_request(
    {
      query: '  project alpha  ',
      limit: 8,
      results_collection_key: 'smart_blocks',
      filter,
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
    limit: 8,
    results_collection_key: 'smart_blocks',
    filter,
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
  const filter_schema = input_schema.properties.filter;

  t.is(filter_schema, collection_tool_action_schemas.filter);
  t.is(
    input_schema.properties.limit,
    collection_tool_action_schemas.limit,
  );
  t.is(
    input_schema.properties.results_collection_key,
    collection_tool_action_schemas.results_collection_key,
  );
  t.is(input_schema.properties.limit.type, 'integer');
  t.is(input_schema.properties.limit.minimum, 1);
  t.deepEqual(input_schema.properties.results_collection_key.enum, [
    'smart_sources',
    'smart_blocks',
  ]);
  t.is(filter_schema.type, 'object');
  t.false(filter_schema.additionalProperties);
  t.deepEqual(Object.keys(filter_schema.properties), [
    'exclude_key',
    'exclude_keys',
    'exclude_key_starts_with',
    'exclude_key_starts_with_any',
    'exclude_key_includes',
    'exclude_key_includes_any',
    'exclude_key_ends_with',
    'exclude_key_ends_with_any',
    'key_ends_with',
    'key_starts_with',
    'key_starts_with_any',
    'key_includes',
    'key_includes_any',
    'frontmatter',
  ]);
  t.is(filter_schema.properties.exclude_keys.items.type, 'string');
  t.deepEqual(
    filter_schema.properties.frontmatter.properties.include
      .items.properties.value.type,
    ['string', 'null'],
  );
  t.deepEqual(action_scope, {
    type: 'item',
    collection_key: 'lookup_lists',
    item_arg: 'key',
  });
  t.is(output_schema, null);
  t.is(tool.project_request, project_lookup_list_request);
  t.is(tool.project_result, project_lookup_list_result);
  t.deepEqual(tool.input_schema.anyOf, [{ required: ['query'] }, { required: ['hypothetical_document'] }]);
  t.false(Object.hasOwn(input_schema.properties, 'embed_request'));
  t.false(Object.hasOwn(tool.input_schema.properties, 'embed_request'));
  t.is(tool.input_schema.properties.limit, input_schema.properties.limit);
  t.is(
    tool.input_schema.properties.results_collection_key,
    input_schema.properties.results_collection_key,
  );
  t.is(tool.input_schema.properties.filter, filter_schema);
  t.deepEqual(input_schema.properties.hypothetical_document.required, ['path', 'content']);
  t.false(input_schema.properties.hypothetical_document.additionalProperties);
  t.is(
    tool.input_schema.properties.hypothetical_document,
    input_schema.properties.hypothetical_document,
  );
  t.is(tool.input_schema.properties.include_content.type, 'boolean');
  t.is(
    tool.output_schema.properties.results.items.properties.content.type,
    'string',
  );
  t.deepEqual(tool.output_schema.required, [
    'ok',
    'key',
    'total',
    'results',
  ]);
});

test('Lookup preprocessing pins similarity and ignores stored/explicit algorithm settings', async t => {
  const scope = {
    settings: { score_algo_key: 'chat_rank', actions: { chat_rank: { weight: 3 } } },
    env: { smart_sources: { embed_model: { async embed() { return { vec: [1, 0] }; } } } },
  };
  const params = { query: 'project', score_algo_key: 'chat_rank', score_settings: { weight: 8 } };
  await pre_process.call(scope, params);
  t.is(params.score_algo_key, 'similarity');
  t.deepEqual(params.score_settings, {});
});

test('project_lookup_list_request validates hypothetical_document against the effective result collection', t => {
  const { env, lookup_lists } = create_lookup_lists_fixture();
  env.smart_sources = {};
  env.smart_blocks = {};
  Object.defineProperty(lookup_lists, 'results_collection_key', {
    value: 'smart_sources',
    configurable: true,
  });

  const projected = project_lookup_list_request({
    query: '  project alpha  ',
    results_collection_key: 'smart_blocks',
    hypothetical_document: {
      path: ' Notes/Alpha.md#Summary ',
      content: '  ## Summary\nBody\n',
    },
  }, { env });

  t.deepEqual(projected.params, {
    query: 'project alpha',
    results_collection_key: 'smart_blocks',
    hypothetical_document: {
      path: 'Notes/Alpha.md#Summary',
      content: '  ## Summary\nBody\n',
    },
  });
  t.false(Object.hasOwn(projected.scope.data, 'hypothetical_document'));

  delete env.smart_blocks;
  const fallback = project_lookup_list_request({
    query: 'project alpha',
    results_collection_key: 'smart_blocks',
    hypothetical_document: {
      path: ' Notes/Alpha.md ',
      content: 'Summary',
    },
  }, { env });
  t.is(fallback.params.results_collection_key, 'smart_sources');
  t.is(fallback.params.hypothetical_document.path, 'Notes/Alpha.md');

  t.throws(() => project_lookup_list_request({
    query: 'project alpha',
    hypothetical_document: { path: 'Notes/Alpha.md', content: ' ' },
  }, { env }));
});

test('Lookup preprocessing defaults to the original query embedding', async t => {
  const query = '  project decisions  ';
  const embed_requests = [];
  const embedding = { vec: [1, 0] };
  const scope = {
    env: {
      smart_sources: {
        embed_model: {
          async embed(request) {
            embed_requests.push(request);
            return embedding;
          },
        },
      },
    },
  };
  const params = { query };

  t.is(await pre_process.call(scope, params), params);
  t.deepEqual(embed_requests, [{ embed_input: query, purpose: 'query' }]);
  t.is(params.query, query);
  t.deepEqual(params.to_item, embedding);
  t.not(params.to_item, embedding);
  t.is(params.score_algo_key, 'similarity');
  t.deepEqual(params.score_settings, {});
});

for (const purpose of ['query', 'document']) {
  test(`Lookup preprocessing honors a complete ${purpose} override without changing query identity`, async t => {
    const embed_request = Object.freeze({
      embed_input: 'Projects > Alpha:\n  A decision record.\n',
      purpose,
    });
    const scope = {
      env: {
        smart_sources: {
          embed_model: {
            async embed(request) {
              t.is(request, embed_request);
              return { vec: [0, 1] };
            },
          },
        },
      },
    };
    const params = { query: 'original query', embed_request };

    await pre_process.call(scope, params);
    t.is(params.query, 'original query');
    t.is(params.embed_request, embed_request);
    t.deepEqual(params.to_item.vec, [0, 1]);
  });
}

test('Lookup preprocessing rejects incomplete or invalid embedding overrides before calling the model', async t => {
  const scope = {
    env: {
      smart_sources: {
        embed_model: {
          async embed() {
            t.fail('An invalid override must not reach the embed model.');
          },
        },
      },
    },
  };
  for (const embed_request of [
    null,
    {},
    { embed_input: 'document' },
    { purpose: 'document' },
    { embed_input: '', purpose: 'document' },
    { embed_input: ' \n ', purpose: 'document' },
    { embed_input: 123, purpose: 'document' },
    { embed_input: 'document', purpose: 'classification' },
  ]) {
    await t.throwsAsync(() => pre_process.call(scope, {
      query: 'original query',
      embed_request,
    }), { message: 'Invalid embed_request provided to lookup list.' });
  }
});

test('Lookup preprocessing allows a query-free document but still requires an embed model', async t => {
  const embed_request = { embed_input: 'document', purpose: 'document' };
  const params = { embed_request };
  await pre_process.call({ env: { smart_sources: { embed_model: {
    async embed(request) { t.is(request, embed_request); return { vec: [0, 1] }; },
  } } } }, params);
  t.false(Object.hasOwn(params, 'query'));
  t.deepEqual(params.to_item.vec, [0, 1]);
  await t.throwsAsync(() => pre_process.call({ env: { smart_sources: {} } }, {
    embed_request,
  }), { message: 'No embed model available in environment for lookup list.' });
  await t.throwsAsync(() => pre_process.call({ env: {} }, { query: ' ' }), {
    message: 'Invalid or empty query provided to lookup list.',
  });
});

test('Lookup preprocessing propagates embedding errors without a scoring target', async t => {
  const error = new Error('Embedding failed.');
  const scope = {
    env: {
      smart_sources: { embed_model: { async embed() { throw error; } } },
    },
  };
  const params = {
    query: 'original query',
    embed_request: { embed_input: 'document', purpose: 'document' },
  };

  t.is(await t.throwsAsync(() => pre_process.call(scope, params)), error);
  t.false(Object.hasOwn(params, 'to_item'));
  t.is(params.query, 'original query');
});

for (const request of [
  {},
  { query: '' },
  { query: '  ', hypothetical_document: { path: 'Doc.md', content: 'Content' } },
  { query: 12 },
  { query: 'x', limit: 0 },
  { query: 'x', limit: 1.5 },
  { query: 'x', results_collection_key: 'chat_threads' },
  { hypothetical_document: null },
  { hypothetical_document: { path: 'Doc.md', content: ' ' } },
  { hypothetical_document: { path: 'Doc.md', content: 'Body', extra: true } },
]) {
  test(`Lookup rejects invalid supplied input: ${JSON.stringify(request)}`, t => {
    const { env } = create_lookup_lists_fixture();
    t.throws(() => project_lookup_list_request(request, { env }));
  });
}

test('Document-only projection creates distinct detached scopes without fabricating a query', async t => {
  const { env, lookup_lists } = create_lookup_lists_fixture();
  const hypothetical_document = { path: 'Notes/Alpha.md', content: 'Body' };
  const first = project_lookup_list_request({ hypothetical_document }, { env });
  const second = project_lookup_list_request({ hypothetical_document: { ...hypothetical_document, content: 'Other body' } }, { env });
  t.not(first.scope.key, second.scope.key);
  t.false(Object.hasOwn(first.params, 'query'));
  t.false(Object.hasOwn(first.scope.data, 'query'));
  t.false(Object.hasOwn(first.scope.data, 'hypothetical_document'));
  t.deepEqual(lookup_lists.items, {});
  const result = await project_lookup_list_result([], { scope: first.scope, params: first.params });
  t.deepEqual(result, { ok: true, key: first.scope.key, total: 0, results: [] });
  t.false(JSON.stringify(first.scope.data).includes('Body'));
});
