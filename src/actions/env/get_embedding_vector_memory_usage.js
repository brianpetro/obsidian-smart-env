/**
 * Get memory allocated to loaded embedding vectors.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {number} allocated bytes
 */
export function env_get_embedding_vector_memory_usage() {
  return Object.keys(this.collections).reduce((total_bytes, collection_key) => {
    const vectors_by_file = this[collection_key]?.embeddings?._vectors_by_file;
    if (!vectors_by_file) return total_bytes;

    return total_bytes + Object.values(vectors_by_file).reduce(
      (collection_bytes, vectors) => collection_bytes + vectors.byteLength,
      0,
    );
  }, 0);
}

export const action_scope = {
  type: 'env',
};
