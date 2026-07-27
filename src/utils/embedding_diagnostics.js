import { DEFAULT_EMBEDDING_TYPE } from './embedding_item.js';

/**
 * Determine whether an item has a current vector without resolving item.vec.
 *
 * @param {object} item
 * @param {object} embeddings
 * @param {object|null} [file_info]
 * @param {string|undefined} [read_hash_override]
 * @returns {boolean}
 */
export function has_current_embedding(
  item,
  embeddings,
  file_info = null,
  read_hash_override,
) {
  if (!item || !embeddings) return false;

  const resolved_file_info = file_info || get_embeddings_file_info(embeddings);
  const {
    model_fingerprint = '',
    file = '',
    dims = 0,
    value_count = 0,
  } = resolved_file_info || {};
  if (!model_fingerprint || !file || !dims || !value_count) return false;

  let item_data;
  try {
    item_data = item.data;
  } catch {
    return false;
  }

  const embedding_refs = item_data?.embedding?.[DEFAULT_EMBEDDING_TYPE];
  if (!embedding_refs) return false;

  let ref;
  if (embedding_refs.file) {
    const legacy_model_fingerprint = embedding_refs.model_fingerprint
      || embedding_refs.file
    ;
    if (legacy_model_fingerprint !== model_fingerprint) return false;
    ref = embedding_refs;
  } else {
    ref = embedding_refs[model_fingerprint];
  }

  if (
    ref?.file !== file
    || !Number.isInteger(ref.file_i)
    || ref.file_i < 0
  ) {
    return false;
  }

  const read_hash = read_hash_override ?? item_data?.last_read?.hash ?? '';
  if (!ref.read_hash || ref.read_hash !== read_hash) return false;

  return (ref.file_i + 1) * dims <= value_count;
}

/**
 * Resolve immutable active-vector-file metadata once per collection scan.
 *
 * @param {object} embeddings
 * @returns {object|null}
 */
export function get_embeddings_file_info(embeddings) {
  if (!embeddings) return null;

  try {
    if (typeof embeddings.get_active_file_info === 'function') {
      return embeddings.get_active_file_info();
    }

    const model_fingerprint = embeddings.model_fingerprint || '';
    const file = embeddings.active_file || model_fingerprint;
    const dims = Number(embeddings.dims || 0);
    const value_count = Number(
      embeddings.get_vector_value_count?.(file)
      ?? embeddings._vectors_by_file?.[file]?.length
      ?? 0
    );
    return {
      model_fingerprint,
      file,
      dims,
      value_count,
    };
  } catch {
    return null;
  }
}

/**
 * Yield after a bounded amount of synchronous work so Obsidian can paint and
 * process input while large vaults are scanned.
 *
 * @returns {Promise<void>}
 */
export function yield_to_main_thread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
