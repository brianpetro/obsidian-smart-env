export async function smart_block_read() {
  if (typeof this.read !== 'function') {
    throw new Error('Unable to read Smart Block.');
  }
  const result = await this.read();
  if (result === null || result === undefined) return '';
  return typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2)
  ;
}

export const display_name = 'Read Smart Block';
export const display_description = 'Returns the text for an exact Smart Block key.';
export const input_schema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
export const output_schema = {
  type: 'string',
};
export const action_scope = {
  type: 'item',
  collection_key: 'smart_blocks',
  item_arg: 'key',
};
export const tool = {
  name: 'smart_block_read',
  description:
    'Use to read the text of one existing Smart Block when its exact block key is known.'
    + ' Do not use for an entire source or discovery; use smart_source_read for a source and smart_lookup_query with results_collection_key set to smart_blocks when the key is unknown.'
    + ' This tool does not modify the vault.',
  when({ env }) {
    return Boolean(env.smart_blocks);
  },
  input_schema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        minLength: 1,
        description: 'Exact Smart Block key.',
      },
    },
    required: ['key'],
    additionalProperties: false,
  },
  project_request: project_smart_block_read_request,
  effects: {
    read_only: true,
    destructive: false,
    idempotent: true,
  },
};

export function project_smart_block_read_request(request, { env }) {
  const block_key = request.key.trim();
  if (!block_key) throw new Error('Missing required argument: key');

  const block = env.smart_blocks.get(block_key);
  if (!block) {
    throw new Error(`Smart Block not found: "${block_key}".`);
  }

  return {
    scope: block,
    params: {},
  };
}
