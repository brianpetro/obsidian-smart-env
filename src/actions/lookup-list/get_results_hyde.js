import {
  input_schema as lookup_input_schema,
  tool as lookup_tool,
} from './get_results.js';

/** Narrow input boundary; all retrieval remains in the canonical Lookup action. */
export async function lookup_list_get_results_hyde(params = {}) {
  if (params.hypothetical_document === undefined || params.query !== undefined) {
    throw new Error('smart_lookup_hyde requires hypothetical_document and does not accept query.');
  }
  return await this.actions.lookup_list_get_results(params);
}

export const display_name = 'Document Smart Lookup';
export const display_description = 'Retrieve using a caller-provided hypothetical_document with canonical source/block formatting and document embeddings. No query or chat model is required.';
const { query: _query, ...properties } = lookup_input_schema.properties;
export const input_schema = {
  type: 'object',
  properties,
  required: ['hypothetical_document'],
  additionalProperties: false,
};
export { action_scope, output_schema, version } from './get_results.js';
export const tool = {
  ...lookup_tool,
  name: 'smart_lookup_hyde',
  description: display_description,
  input_schema: {
    ...input_schema,
    properties: {
      ...properties,
      include_content: lookup_tool.input_schema.properties.include_content,
    },
  },
};
