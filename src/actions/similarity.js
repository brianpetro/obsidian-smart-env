import { Embeddings } from '../modules/embeddings.js';

/**
 * Calculate cosine similarity between two items based on their vectors.
 * @returns {{score: number}|{score: null, error: string}}
 */

function similarity(params){
  const embeddings = this.collection?.embeddings;
  // Direct action callers may supply plain vector-bearing objects without a collection.
  const cosine_similarity = typeof embeddings?.cosine_similarity === 'function'
    ? embeddings.cosine_similarity
    : Embeddings.prototype.cosine_similarity
  ;
  try {
    return { score: cosine_similarity.call(embeddings, this, params?.to_item) };
  } catch (error) {
    // Use stable codes rather than instanceof across independently bundled modules.
    if (error?.code === 'MISSING_FROM_VECTOR') {
      return { score: null, error: `Missing this.vec for ${this.key}` };
    }
    if (error?.code === 'MISSING_TO_VECTOR') {
      return { score: null, error: 'Missing params.to_item.vec' };
    }
    throw error;
  }
}
similarity.action_type = 'score';

export const display_name = 'Cosine Similarity';
export const display_description = 'Ranks by cosine similarity between the current note and candidates.';
export const settings_config = {
  similarity_algo_description: {
    group: 'Score algorithm',
    type: 'html',
    name: `${display_name} algorithm`,
    value: `${display_description}`,
  },
}

export { similarity };
export const version = '3.0.1';