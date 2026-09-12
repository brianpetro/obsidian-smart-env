import {
  input_schema as lookup_input_schema,
  tool as lookup_tool,
} from './get_results.js';

/** Narrow input boundary; all retrieval remains in the canonical Lookup action. */
export async function lookup_list_get_results_query(params = {}) {
  if (params.query === undefined || params.hypothetical_document !== undefined) {
    throw new Error('smart_lookup_query requires query and does not accept hypothetical_document.');
  }
  return await this.actions.lookup_list_get_results(params);
}

export const display_name = 'Query Smart Lookup';
export const display_description = 'Query-purpose semantic retrieval only. No hypothetical document or chat model is used.';
const { hypothetical_document: _hypothetical_document, ...properties } = lookup_input_schema.properties;
export const input_schema = {
  type: 'object',
  properties,
  required: ['query'],
  additionalProperties: false,
};
export { action_scope, output_schema, version } from './get_results.js';
export const tool = {
  ...lookup_tool,
  name: 'smart_lookup_query',
  description: display_description,
  input_schema: {
    ...input_schema,
    properties: {
      ...properties,
      include_content: lookup_tool.input_schema.properties.include_content,
    },
  },
};
