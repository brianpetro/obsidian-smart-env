import { results_acc } from 'smart-utils/results_acc.js';
import { sort_by_score_descending } from 'smart-utils/sort_by_score.js';

/**
 * Return the top collection items by cosine similarity without applying filters.
 * Reads candidate vectors directly from the active contiguous Float32Array.
 *
 * @this {object}
 * @param {{vec: Float32Array, k: number}} params
 * @returns {Array<{item: object, score: number}>}
 */
export function top_k(params = {}) {
  const { vec, k } = params;
  if (!vec?.length || !Number.isInteger(k) || k <= 0) return [];

  const embeddings = this.embeddings;
  const file_info = embeddings?.get_active_file_info();
  const vectors = embeddings?._vectors_by_file?.[file_info?.file];
  if (!vectors?.length || !file_info?.dims) return [];

  const dims = file_info.dims;
  if (vec.length !== dims) {
    throw new Error('Vectors must have the same length');
  }

  let source_magnitude = 0;
  for (let dim_i = 0; dim_i < dims; dim_i += 1) {
    const source_value = vec[dim_i];
    source_magnitude += source_value * source_value;
  }
  source_magnitude = Math.sqrt(source_magnitude);

  const results_state = {
    min: Number.POSITIVE_INFINITY,
    minResult: null,
    results: new Set(),
  };
  const items = Object.values(this.items || {});
  for (let item_i = 0; item_i < items.length; item_i += 1) {
    const item = items[item_i];
    const ref = embeddings.get_item_embedding_ref(
      item,
      undefined,
      file_info.model_fingerprint,
    );
    if (
      ref?.file !== file_info.file
      || !ref.read_hash
      || ref.read_hash !== item.read_hash
      || !Number.isInteger(ref.file_i)
      || ref.file_i < 0
    ) continue;

    const vector_start = ref.file_i * dims;
    const vector_end = vector_start + dims;
    if (vector_end > file_info.value_count) continue;

    let dot_product = 0;
    let target_magnitude = 0;
    for (let dim_i = 0; dim_i < dims; dim_i += 1) {
      const source_value = vec[dim_i];
      const target_value = vectors[vector_start + dim_i];
      dot_product += source_value * target_value;
      target_magnitude += target_value * target_value;
    }
    target_magnitude = Math.sqrt(target_magnitude);
    const score = source_magnitude < 1e-8 || target_magnitude < 1e-8
      ? 0
      : dot_product / (source_magnitude * target_magnitude)
    ;
    if (!Number.isFinite(score)) continue;

    if (results_state.results.size < k || score > results_state.min) {
      results_acc(results_state, { item, score }, k);
    }
  }

  return Array.from(results_state.results).sort(sort_by_score_descending);
}
