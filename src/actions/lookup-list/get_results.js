/**
 * Retrieve results for the current Lookup List using the selected strategy.
 *
 * The canonical action remains stable while optional strategies register under
 * their own action keys and are selected through Lookup List settings.
 *
 * @this {import('../../items/lookup_list.js').LookupList}
 * @param {object} [params={}]
 * @returns {Promise<Array>}
 */
export async function lookup_list_get_results(params = {}) {
  const action_key = this.settings?.get_results_action_key;
  if (action_key && action_key !== 'lookup_list_get_results') {
    const selected_action = this.actions?.[action_key];
    if (typeof selected_action !== 'function') {
      throw new Error(
        `Configured Lookup retrieval action not found: ${action_key}`,
      );
    }
    return await selected_action.call(this, params);
  }
  return await this.get_results(params);
}

export const display_name = 'Query Smart Lookup';
export const display_description = 'Runs the configured Smart Lookup retrieval strategy and returns ranked results.';
export const input_schema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'Smart Lookup query.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      description: 'Maximum number of ranked results to return.',
    },
    results_collection_key: {
      type: 'string',
      enum: ['smart_sources', 'smart_blocks'],
      description: 'Candidate collection to search: smart_sources for note-level results or smart_blocks for block-level results. Uses the configured collection when omitted.',
    },
    filter: {
      type: 'object',
      description: 'Optional key filters for candidate result items. String comparisons are case-sensitive. Smart Sources and Smart Blocks also support frontmatter filters.',
      properties: {
        exclude_key: {
          type: 'string',
          minLength: 1,
          description: 'Exclude the item with this exact key.',
        },
        exclude_keys: {
          type: 'array',
          description: 'Exclude items with any of these exact keys.',
          items: {
            type: 'string',
            minLength: 1,
          },
        },
        exclude_key_starts_with: {
          type: 'string',
          minLength: 1,
          description: 'Exclude items whose keys start with this value.',
        },
        exclude_key_starts_with_any: {
          type: 'array',
          description: 'Exclude items whose keys start with any of these values.',
          items: {
            type: 'string',
            minLength: 1,
          },
        },
        exclude_key_includes: {
          type: 'string',
          minLength: 1,
          description: 'Exclude items whose keys contain this value.',
        },
        exclude_key_includes_any: {
          type: 'array',
          description: 'Exclude items whose keys contain any of these values.',
          items: {
            type: 'string',
            minLength: 1,
          },
        },
        exclude_key_ends_with: {
          type: 'string',
          minLength: 1,
          description: 'Exclude items whose keys end with this value.',
        },
        exclude_key_ends_with_any: {
          type: 'array',
          description: 'Exclude items whose keys end with any of these values.',
          items: {
            type: 'string',
            minLength: 1,
          },
        },
        key_ends_with: {
          type: 'string',
          minLength: 1,
          description: 'Include only items whose keys end with this value.',
        },
        key_starts_with: {
          type: 'string',
          minLength: 1,
          description: 'Include only items whose keys start with this value.',
        },
        key_starts_with_any: {
          type: 'array',
          description: 'Include only items whose keys start with any of these values.',
          items: {
            type: 'string',
            minLength: 1,
          },
        },
        key_includes: {
          type: 'string',
          minLength: 1,
          description: 'Include only items whose keys contain this value.',
        },
        key_includes_any: {
          type: 'array',
          description: 'Include only items whose keys contain any of these values.',
          items: {
            type: 'string',
            minLength: 1,
          },
        },
        frontmatter: {
          type: 'object',
          description: 'Filter Smart Sources by their frontmatter, or Smart Blocks by their source frontmatter. Use lowercase key and value strings.',
          properties: {
            include: {
              type: 'array',
              description: 'Include only items matching at least one entry.',
              items: {
                type: 'object',
                properties: {
                  key: {
                    type: 'string',
                    minLength: 1,
                    description: 'Lowercase frontmatter key to match.',
                  },
                  value: {
                    type: ['string', 'null'],
                    description: 'Optional lowercase exact value. Omit or use null to match any value for the key.',
                  },
                },
                required: ['key'],
                additionalProperties: false,
              },
            },
            exclude: {
              type: 'array',
              description: 'Exclude items matching any entry.',
              items: {
                type: 'object',
                properties: {
                  key: {
                    type: 'string',
                    minLength: 1,
                    description: 'Lowercase frontmatter key to match.',
                  },
                  value: {
                    type: ['string', 'null'],
                    description: 'Optional lowercase exact value. Omit or use null to match any value for the key.',
                  },
                },
                required: ['key'],
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  required: ['query'],
  additionalProperties: false,
};
export const output_schema = null;
export const action_scope = {
  type: 'item',
  collection_key: 'lookup_lists',
  item_arg: 'key',
};
export const tool = {
  name: 'smart_lookup_query',

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
    required: ['ok', 'key', 'query', 'total', 'results'],
    additionalProperties: false,
  },
};

/**
 * Convert the public query into the exact Lookup List scope and natural
 * retrieval params.
 *
 * @param {{query: string, limit?: number, results_collection_key?: string, filter?: object, include_content?: boolean}} request
 * @param {{env: object}} context
 * @returns {{scope: object, params: {query: string, limit?: number, results_collection_key?: string, filter?: object}}}
 */
export function project_lookup_list_request(request, { env }) {
  const query = to_trimmed_string(request.query);
  if (!query) throw new Error('Missing required argument: query');

  const lookup_list = env.lookup_lists.new_lookup_list({ query });

  return {
    scope: lookup_list,
    params: {
      query,
      ...(request.limit ? { limit: request.limit } : {}),
      ...(request.results_collection_key
        ? { results_collection_key: request.results_collection_key }
        : {}),
      ...(request.filter ? { filter: request.filter } : {}),
    },
  };
}

/**
 * Convert native Lookup List results into the shared public tool result.
 *
 * @param {Array<object>} raw_result
 * @param {{scope: object, request?: {include_content?: boolean}, params: {query: string}}} context
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
  if (!query) throw new TypeError('Lookup List scope is missing its query.');

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
    query,
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
