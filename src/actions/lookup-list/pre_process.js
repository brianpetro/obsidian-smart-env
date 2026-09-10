

export async function pre_process(params) {
  const query = params.query;
  if(!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Invalid or empty query provided to lookup list.');
  }
  const embed_model = this.env.smart_sources.embed_model;
  if(!embed_model) {
    throw new Error('No embed model available in environment for lookup list.');
  }
  const embedding = await embed_model.embed({
    embed_input: query,
    purpose: 'query',
  });
  params.to_item = { ...embedding };
  // default use similarity as score algorithm
  if(!params.score_algo_key) params.score_algo_key = 'similarity';
  // Scoring settings belong to this retrieval, not to the candidate's collection.
  if (params.score_settings == null) {
    params.score_settings = this.settings?.actions?.[params.score_algo_key] || {};
  }
  return params;
}