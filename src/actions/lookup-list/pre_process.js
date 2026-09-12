// Retrieval and preprocessing must supersede older query-only registrations together.
export { version } from './get_results.js';

/**
 * Embed one retrieval input while preserving the original lookup query.
 *
 * @param {object} params
 * @param {string} [params.query]
 * @param {{embed_input: string, purpose: 'query'|'document'}} [params.embed_request] - Complete internal embedding override.
 * @param {string} [params.score_algo_key]
 * @param {object} [params.score_settings]
 * @param {object} [params.to_item] - Scoring target populated by this action.
 * @returns {Promise<object>}
 */
export async function pre_process(params) {
  const query = params.query;
  if (params.embed_request === undefined && (typeof query !== 'string' || !query.trim())) {
    throw new Error('Invalid or empty query provided to lookup list.');
  }
  const embed_model = this.env.smart_sources?.embed_model;
  if(!embed_model) {
    throw new Error('No embed model available in environment for lookup list.');
  }
  const embed_request = params.embed_request === undefined
    ? { embed_input: query, purpose: 'query' }
    : params.embed_request
  ;
  // Do not let a partial override silently select the model's default purpose.
  if (
    !embed_request
    || typeof embed_request.embed_input !== 'string'
    || !embed_request.embed_input.trim()
    || !['query', 'document'].includes(embed_request.purpose)
  ) {
    throw new Error('Invalid embed_request provided to lookup list.');
  }
  const embedding = await embed_model.embed(embed_request);
  params.to_item = { ...embedding };
  // Lookup is similarity-only; saved algorithm/ranking choices are no longer consulted.
  params.score_algo_key = 'similarity';
  params.score_settings = {};
  return params;
}
