/**
 * Get used and allocated memory for loaded embedding vectors.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {{used_bytes: number, allocated_bytes: number, unused_capacity_bytes: number}}
 */
export function env_get_embedding_vector_memory_usage() {
  let used_bytes = 0;
  let allocated_bytes = 0;

  for (const collection_key of Object.keys(this.collections)) {
    const embeddings = this[collection_key]?.embeddings;
    const vectors_by_file = embeddings?._vectors_by_file;
    if (!vectors_by_file) continue;

    for (const [file, vectors] of Object.entries(vectors_by_file)) {
      used_bytes += embeddings.get_vector_value_count(file)
        * Float32Array.BYTES_PER_ELEMENT
      ;
      allocated_bytes += vectors.byteLength;
    }
  }

  return {
    used_bytes,
    allocated_bytes,
    unused_capacity_bytes: allocated_bytes - used_bytes,
  };
}

export const action_scope = {
  type: 'env',
};
