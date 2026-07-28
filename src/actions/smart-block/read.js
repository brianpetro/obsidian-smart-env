export async function smart_block_read(params = {}) {
  if (typeof this.read !== 'function') {
    throw new Error('Unable to read Smart Block.');
  }
  const result = await this.read(params);
  if (result === null || result === undefined) return '';
  return typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2)
  ;
}

export const display_name = 'Read Smart Block';
export const display_description = 'Returns the text for a Smart Block key.';
export const input_schema = {
  type: 'object',
  properties: {
    key: {
      type: 'string',
      minLength: 1,
      description: 'Smart Block key.',
    },
  },
  required: ['key'],
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
  when({ env }) {
    return Boolean(env.smart_blocks);
  },
  effects: {
    read_only: true,
    destructive: false,
    idempotent: true,
  },
};
