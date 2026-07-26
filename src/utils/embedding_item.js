export const DEFAULT_EMBEDDING_TYPE = 'default';

export function ensure_embedding_data(item) {
  if (!item.data.embedding) item.data.embedding = {};
  if (!Array.isArray(item.data.embedding.history)) {
    item.data.embedding.history = [];
  }
  return item.data.embedding;
}

export function get_embedding_ref(item, type = DEFAULT_EMBEDDING_TYPE) {
  return item.data?.embedding?.[type] || null;
}

export function set_embedding_ref(item, next_ref, type = DEFAULT_EMBEDDING_TYPE) {
  const embedding = ensure_embedding_data(item);
  const current_ref = embedding[type];

  if (current_ref?.file && (
    current_ref.file !== next_ref.file
    || current_ref.file_i !== next_ref.file_i
    || current_ref.read_hash !== next_ref.read_hash
  )) {
    embedding.history.push({
      type,
      ...current_ref,
    });
  }

  embedding[type] = {
    file: next_ref.file,
    file_i: next_ref.file_i,
    read_hash: next_ref.read_hash || '',
    at: next_ref.at || Date.now(),
  };
  delete embedding.error;

  return embedding[type];
}

export function prune_legacy_embedding_data(item) {
  if (item.data.embeddings) delete item.data.embeddings;
  if (item.data.last_embed) delete item.data.last_embed;
}
