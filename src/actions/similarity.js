import { cos_sim } from 'smart-utils/cos_sim.js';

/**
 * Calculate cosine similarity between two items based on their vectors.
 * @returns {number}
 */

function similarity(params){
  if(!this.vec) return { score: null, error: `Missing this.vec for ${this.key}` };
  if(!params.to_item?.vec) return { score: null, error: 'Missing params.to_item.vec' };
  return {
    score: cos_sim(this.vec || [], params.to_item.vec || [])
  };
}
similarity.action_type = 'score';

export const display_name = 'Cosine Similarity';
export const display_description = 'Ranks by cosine similarity between the current note and candidates.';
export const settings_config = {
  score_algo_description: {
    type: 'html',
    value: `<p><small><b>${display_name}</b>: ${display_description}</small></p>`,
  },
}

export { similarity };