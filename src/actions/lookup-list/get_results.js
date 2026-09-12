import { collection_tool_action_schemas } from '../../utils/collection_tool_action_schemas.js';

// Keep the query/document contract ahead of query-only actions bundled by other plugins.
export const version = '3.1.4';

/**
 * Retrieve exactly the supplied query and/or hypothetical document.
 * Query and document passes share candidate controls, but never embedding purpose.
 * A failed document pass falls back only when a query pass has already succeeded.
 *
 * @this {import('../../items/lookup_list.js').LookupList}
 * @param {object} [params={}]
 * @returns {Promise<Array>}
 */
export async function lookup_list_get_results(params = {}) {
  const { query, hypothetical_document, ...retrieval_params } = normalize_lookup_params(params, this.env);
  const limit = retrieval_params.limit || this.settings.results_limit || 20;
  const pass_params = { ...retrieval_params, limit };
  const query_results = query === undefined ? null : await this.get_results({
    ...pass_params,
    query,
    embed_request: { embed_input: query, purpose: 'query' },
  });
  if (!hypothetical_document) return query_results;

  try {
    const { path, content } = hypothetical_document;
    let item;
    if (retrieval_params.results_collection_key === 'smart_sources') {
      item = new this.env.smart_sources.item_type(this.env, { path });
    } else {
      const source_path = path.slice(0, path.indexOf('#'));
      const source = new this.env.smart_sources.item_type(this.env, { path: source_path });
      item = new this.env.smart_blocks.item_type(this.env, { key: path });
      // Link the detached parent before a source-dependent adapter is selected.
      item._source_override = source;
    }
    const embed_input = await item.get_embed_input(content);
    if (!embed_input.trim()) return query_results || [];

    const document_results = await this.get_results({
      ...pass_params,
      ...(query === undefined ? {} : { query }),
      embed_request: { embed_input, purpose: 'document' },
    });
    return query_results === null
      ? document_results
      : combine_lookup_results(query_results, document_results, limit)
    ;
  } catch (error) {
    if (query_results === null) throw error;
    this.emit_warning_event('lookup:hyde_fallback', {
      message: 'Document lookup failed. Using query results instead.',
      query,
      error: String(error),
      event_source: 'lookup_list_get_results',
    });
    return query_results;
  }
}

/** Combine two passes without mutating their scores; also used by the Pro UI. */
export function combine_lookup_results(query_results, document_results, limit) {
  const results_by_key = new Map();
  for (const results of [query_results, document_results]) {
    for (const result of results) {
      const existing_result = results_by_key.get(result.item.key);
      if (existing_result) existing_result.score += result.score;
      else results_by_key.set(result.item.key, { ...result });
    }
  }
  return Array.from(results_by_key.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  ;
}

export const display_name = 'Smart Lookup';
export const display_description = 'Searches using a query, a caller-provided hypothetical document, or both. No chat model is called.';
export const input_schema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      pattern: '\\S',
      description: 'Original search intent, embedded with query semantics.',
    },
    hypothetical_document: {
      type: 'object',
      description: 'Caller-provided item embedded with canonical source/block formatting and document semantics. Its path is a representation hint, never a filter or source evidence. When a query is also supplied, the two result sets are combined.',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          pattern: '\\S',
          description: 'Hypothetical source path or block key. Block keys include #, with a trailing # for the root block.',
        },
        content: {
          type: 'string',
          minLength: 1,
          pattern: '\\S',
          description: 'Hypothetical source or block content.',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    ...collection_tool_action_schemas,
  },
  anyOf: [{ required: ['query'] }, { required: ['hypothetical_document'] }],
  additionalProperties: false,
};
export const output_schema = null;
export const action_scope = {
  type: 'item',
  collection_key: 'lookup_lists',
  item_arg: 'key',
};
export const tool = {
  name: 'smart_lookup',
  description:
    'Use for semantic discovery when the request is expressed as a topic, question, or concept and no exact source or block key is known.'
    + ' Uses every supplied retrieval input: query, hypothetical_document, or both. Returns ranked keys, scores, and optional content without calling a chat model.'
    + ' Do not use to read a known key or find items related to a known source; use smart_source_read, smart_block_read, or smart_connections_list.',

  when({ env }) {
    return Boolean(env.lookup_lists && env.smart_sources);
  },

  input_schema: {
    ...input_schema,
    properties: {
      ...input_schema.properties,
      include_content: {
        type: 'boolean',
        description: 'Include the text content of each returned item.',
      },
    },
  },

  project_request: project_lookup_list_request,

  effects: {
    read_only: true,
    destructive: false,
    idempotent: true,
  },

  project_result: project_lookup_list_result,

  output_schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      key: { type: 'string' },
      query: { type: 'string' },
      total: { type: 'integer' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            collection_key: { type: 'string' },
            score: { type: ['number', 'null'] },
            content: {
              type: 'string',
              description: 'Item text when include_content is true.',
            },
          },
          required: ['key', 'collection_key', 'score'],
          additionalProperties: false,
        },
      },
    },
    required: ['ok', 'key', 'total', 'results'],
    additionalProperties: false,
  },
};

/**
 * Normalize public inputs before constructing a fresh, unregistered Lookup scope.
 * Only the original query (when supplied) enters scope data, never hypothetical content.
 *
 * @param {object} request
 * @param {{env: object}} context
 * @returns {{scope: object, params: object}}
 */
export function project_lookup_list_request(request, { env }) {
  const params = normalize_lookup_params(request, env);
  return {
    scope: env.lookup_lists.new_lookup_list(params),
    params,
  };
}

/** Public projection and direct action calls share the same input/collection rules. */
function normalize_lookup_params(params, env) {
  const query = params.query;
  if (query !== undefined && (typeof query !== 'string' || !query.trim())) {
    throw new Error('query must be a non-empty string.');
  }
  if (query === undefined && params.hypothetical_document === undefined) {
    throw new Error('Provide query or hypothetical_document.');
  }
  if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1)) {
    throw new Error('limit must be a positive integer.');
  }
  if (params.results_collection_key !== undefined && !['smart_sources', 'smart_blocks'].includes(params.results_collection_key)) {
    throw new Error('Invalid results_collection_key.');
  }
  const results_collection_key = env[params.results_collection_key]
    ? params.results_collection_key
    : env.lookup_lists.results_collection_key
  ;
  if (!env[results_collection_key]) throw new Error('Lookup result collection is unavailable.');

  let hypothetical_document;
  if (params.hypothetical_document !== undefined) {
    const { path, content } = params.hypothetical_document || {};
    if (typeof path !== 'string' || !path.trim()) {
      throw new Error('hypothetical_document.path is required.');
    }
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('hypothetical_document.content is required.');
    }
    if (Object.keys(params.hypothetical_document).some(key => key !== 'path' && key !== 'content')) {
      throw new Error('hypothetical_document accepts only path and content.');
    }
    const normalized_path = path.trim();
    if (results_collection_key === 'smart_sources' && normalized_path.includes('#')) {
      throw new Error('hypothetical_document.path must be a source path for smart_sources.');
    }
    if (results_collection_key === 'smart_blocks' && normalized_path.indexOf('#') <= 0) {
      throw new Error('hypothetical_document.path must be a block key for smart_blocks.');
    }
    hypothetical_document = { path: normalized_path, content };
  }
  return {
    ...(query === undefined ? {} : { query: query.trim() }),
    ...(hypothetical_document ? { hypothetical_document } : {}),
    results_collection_key,
    ...(params.limit === undefined ? {} : { limit: params.limit }),
    ...(params.filter ? { filter: params.filter } : {}),
  };
}

/**
 * Convert native Lookup List results into the shared public tool result.
 *
 * @param {Array<object>} raw_result
 * @param {{scope: object, request?: {include_content?: boolean}, params: {query?: string}}} context
 * @returns {Promise<object>}
 */
export async function project_lookup_list_result(
  raw_result,
  {
    scope,
    request,
    params,
  },
) {
  if (!Array.isArray(raw_result)) {
    throw new TypeError('Lookup List results must be an array.');
  }

  const key = to_trimmed_string(scope?.key)
    || to_trimmed_string(scope?.data?.key)
  ;
  if (!key) throw new TypeError('Lookup List scope is missing its key.');

  const query = to_trimmed_string(scope?.data?.query)
    || to_trimmed_string(params?.query)
  ;

  const include_content = request?.include_content === true;
  const results = await Promise.all(
    raw_result.map((result, result_i) => {
      return to_result(result, result_i, {
        include_content,
      });
    }),
  );

  return {
    ok: true,
    key,
    ...(query ? { query } : {}),
    total: results.length,
    results,
  };
}

async function to_result(
  result,
  result_i,
  {
    include_content = false,
  } = {},
) {
  const item = result?.item;
  const key = to_trimmed_string(item?.key)
    || to_trimmed_string(item?.data?.key)
    || to_trimmed_string(item?.path)
  ;
  if (!key) {
    throw new TypeError(
      `Lookup List result ${result_i} is missing an item key.`,
    );
  }

  const collection_key = to_trimmed_string(item?.collection_key)
    || to_trimmed_string(item?.collection?.collection_key)
  ;
  if (!collection_key) {
    throw new TypeError(
      `Lookup List result ${result_i} is missing a collection key.`,
    );
  }

  const projected_result = {
    key,
    collection_key,
    score: Number.isFinite(result?.score) ? result.score : null,
  };

  if (!include_content) {
    return projected_result;
  }

  return {
    ...projected_result,
    content: await read_result_content(item, result_i),
  };
}

async function read_result_content(item, result_i) {
  if (typeof item?.read !== 'function') {
    throw new TypeError(
      `Lookup List result ${result_i} cannot provide content.`,
    );
  }

  const content = await item.read();
  if (content === null || content === undefined) {
    return '';
  }

  return typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2)
  ;
}

function to_trimmed_string(value) {
  return typeof value === 'string' ? value.trim() : '';
}
