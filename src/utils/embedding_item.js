export const DEFAULT_EMBEDDING_TYPE = 'default';

export function ensure_embedding_data(item) {
  if (!item.data) item.data = {};
  if (!item.data.embedding) item.data.embedding = {};
  if (!Array.isArray(item.data.embedding.history)) {
    item.data.embedding.history = [];
  }
  return item.data.embedding;
}

export function has_legacy_embedding_refs(data = {}, type = DEFAULT_EMBEDDING_TYPE) {
  return Boolean(data?.embedding?.[type]?.file);
}

export function migrate_embedding_refs(item, type = DEFAULT_EMBEDDING_TYPE) {
  const embedding = item.data?.embedding;
  const legacy_ref = embedding?.[type];
  if (!legacy_ref?.file) return false;

  const refs = {};
  const history = Array.isArray(embedding.history) ? embedding.history : [];
  history.forEach((history_ref) => {
    if ((history_ref?.type || DEFAULT_EMBEDDING_TYPE) !== type) return;
    if (!history_ref?.file) return;

    const model_fingerprint = history_ref.model_fingerprint || history_ref.file;
    const current_ref = refs[model_fingerprint];
    if (!current_ref || Number(history_ref.at || 0) >= Number(current_ref.at || 0)) {
      refs[model_fingerprint] = copy_embedding_ref(history_ref);
    }
  });

  const model_fingerprint = legacy_ref.model_fingerprint || legacy_ref.file;
  refs[model_fingerprint] = copy_embedding_ref(legacy_ref);
  embedding[type] = refs;
  embedding.history = history;
  return true;
}

export function get_embedding_refs(item, type = DEFAULT_EMBEDDING_TYPE) {
  migrate_embedding_refs(item, type);
  return item.data?.embedding?.[type] || {};
}

export function get_embedding_ref(
  item,
  type = DEFAULT_EMBEDDING_TYPE,
  model_fingerprint = '',
) {
  const refs = get_embedding_refs(item, type);
  if (model_fingerprint) return refs[model_fingerprint] || null;

  return Object.values(refs).reduce((latest_ref, ref) => {
    if (!ref?.file) return latest_ref;
    if (!latest_ref || Number(ref.at || 0) >= Number(latest_ref.at || 0)) return ref;
    return latest_ref;
  }, null);
}

export function set_embedding_ref(
  item,
  next_ref,
  type = DEFAULT_EMBEDDING_TYPE,
  model_fingerprint = next_ref.model_fingerprint || next_ref.file,
) {
  if (!model_fingerprint) return null;

  const embedding = ensure_embedding_data(item);
  migrate_embedding_refs(item, type);
  if (!embedding[type]) embedding[type] = {};

  const current_ref = embedding[type][model_fingerprint];
  if (current_ref?.file && (
    current_ref.file !== next_ref.file
    || current_ref.file_i !== next_ref.file_i
    || current_ref.read_hash !== next_ref.read_hash
  )) {
    embedding.history.push({
      type,
      model_fingerprint,
      ...current_ref,
    });
  }

  embedding[type][model_fingerprint] = copy_embedding_ref(next_ref);
  delete embedding.error;

  return embedding[type][model_fingerprint];
}

export function delete_embedding_ref(
  item,
  type = DEFAULT_EMBEDDING_TYPE,
  model_fingerprint = '',
) {
  const embedding = item.data?.embedding;
  if (!embedding) return false;

  migrate_embedding_refs(item, type);
  if (!embedding[type]) return false;

  if (!model_fingerprint) {
    delete embedding[type];
    return true;
  }

  if (!embedding[type][model_fingerprint]) return false;
  delete embedding[type][model_fingerprint];
  if (!Object.keys(embedding[type]).length) delete embedding[type];
  return true;
}

export function prune_legacy_embedding_data(item) {
  if (item.data.embeddings) delete item.data.embeddings;
  if (item.data.last_embed) delete item.data.last_embed;
}

function copy_embedding_ref(ref = {}) {
  return {
    file: ref.file,
    file_i: ref.file_i,
    read_hash: ref.read_hash || '',
    at: ref.at || Date.now(),
  };
}
