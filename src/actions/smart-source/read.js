const OUTPUT_TYPES = [
  'text',
  'meta',
];

export async function smart_source_read(params = {}) {
  const output_type = params.output_type || 'text';

  if (output_type === 'meta') return this.data || {};
  if (output_type !== 'text') {
    throw new Error(`Unsupported Smart Source output type: ${output_type}`);
  }
  if (typeof this.read !== 'function') {
    throw new Error('Unable to read Smart Source.');
  }
  const result = await this.read();
  if (result === null || result === undefined) return '';
  return typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2)
  ;
}

export const display_name = 'Read Smart Source';
export const display_description = 'Returns text or metadata for an exact Smart Source key.';
export const input_schema = {
  type: 'object',
  properties: {
    output_type: {
      type: 'string',
      enum: OUTPUT_TYPES,
      description: 'Return source text or metadata. Defaults to text.',
    },
  },
  additionalProperties: false,
};
export const output_schema = {
  type: [
    'string',
    'object',
  ],
};
export const action_scope = {
  type: 'item',
  collection_key: 'smart_sources',
  item_arg: 'key',
};
export const tool = {
  name: 'smart_source_read',
  when({ env }) {
    return Boolean(env.smart_sources);
  },
  input_schema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        minLength: 1,
        description: 'Exact Smart Source key.',
      },
      output_type: {
        type: 'string',
        enum: OUTPUT_TYPES,
        description: 'Return source text or metadata. Defaults to text.',
      },
    },
    required: ['key'],
    additionalProperties: false,
  },
  project_request: project_smart_source_read_request,
  effects: {
    read_only: true,
    destructive: false,
    idempotent: true,
  },
};

export function project_smart_source_read_request(request, { env }) {
  const source_key = request.key.trim();
  if (!source_key) throw new Error('Missing required argument: key');

  const source = env.smart_sources.get(source_key);
  if (!source) {
    throw new Error(`Smart Source not found: "${source_key}".`);
  }

  return {
    scope: source,
    params: request.output_type
      ? { output_type: request.output_type }
      : {},
  };
}
