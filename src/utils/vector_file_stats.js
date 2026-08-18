import { get_embedding_model_fingerprint } from '../modules/embeddings.js';

const DEFAULT_COLLECTION_KEYS = [
  'smart_sources',
  'smart_blocks',
];
const VECTOR_FILE_PREFIX = 'mf_';

/**
 * List stored vector files, read their sizes with stat, and attribute hashes to
 * configured embedding models where possible.
 *
 * @param {object} env
 * @param {object} [opts]
 * @param {string[]} [opts.collection_keys]
 * @returns {Promise<{
 *   files: object[],
 *   errors: object[],
 *   total_bytes: number,
 *   unknown_size_count: number,
 * }>}
 */
export async function collect_vector_file_stats(env, opts = {}) {
  const collection_keys = opts.collection_keys || DEFAULT_COLLECTION_KEYS;
  const model_lookup = build_embedding_model_lookup(env);
  const collection_results = await Promise.all(
    collection_keys.map((collection_key) => collect_collection_vector_files(
      env,
      collection_key,
      model_lookup,
    )),
  );
  const files = collection_results
    .flatMap((result) => result.files)
    .sort(compare_vector_files)
  ;
  const errors = collection_results.flatMap((result) => result.errors);
  const total_bytes = files.reduce((total, file) => {
    return total + (Number.isFinite(file.size_bytes) ? file.size_bytes : 0);
  }, 0);
  const unknown_size_count = files.reduce((count, file) => {
    return count + (Number.isFinite(file.size_bytes) ? 0 : 1);
  }, 0);

  return {
    files,
    errors,
    total_bytes,
    unknown_size_count,
  };
}

/**
 * Build a fingerprint lookup for every configured embedding model, including
 * legacy fingerprints that predate semantic embedding-space IDs.
 *
 * @param {object} env
 * @returns {Map<string, object>}
 */
export function build_embedding_model_lookup(env) {
  const lookup = new Map();
  const model_items = get_configured_embedding_models(env);

  model_items.forEach((model_item) => {
    const model_record = build_model_record(model_item);
    const current_fingerprint = get_embedding_model_fingerprint(model_item);
    const legacy_fingerprint = get_embedding_model_fingerprint(
      model_item,
      { legacy: true },
    );

    add_model_fingerprint(lookup, current_fingerprint, model_record, false);
    add_model_fingerprint(
      lookup,
      legacy_fingerprint,
      model_record,
      legacy_fingerprint !== current_fingerprint,
    );
  });

  return lookup;
}

/**
 * @param {object} env
 * @param {string} collection_key
 * @param {Map<string, object>} model_lookup
 * @returns {Promise<{files: object[], errors: object[]}>}
 */
async function collect_collection_vector_files(
  env,
  collection_key,
  model_lookup,
) {
  const collection = env?.[collection_key];
  const embeddings = collection?.embeddings;
  const data_fs = embeddings?.data_fs || collection?.data_fs || env?.data_fs;
  const data_dir = embeddings?.data_dir || collection?.data_dir || collection_key;
  const errors = [];

  if (
    !data_fs
    || typeof data_fs.list_files !== 'function'
    || typeof data_fs.stat !== 'function'
  ) {
    errors.push({
      collection_key,
      message: 'Vector file storage is unavailable.',
    });
    return { files: [], errors };
  }

  let listed_files;
  try {
    listed_files = await data_fs.list_files(data_dir);
  } catch (error) {
    errors.push({
      collection_key,
      message: error?.message || String(error),
    });
    return { files: [], errors };
  }

  const vector_files = (listed_files || [])
    .map((file) => normalize_listed_file(file, data_dir))
    .filter((file) => file.name.startsWith(VECTOR_FILE_PREFIX))
  ;
  let active_file = '';
  try {
    active_file = embeddings?.active_file || '';
  } catch {
    active_file = '';
  }
  const files = await Promise.all(vector_files.map(async (file) => {
    const parsed_file = parse_vector_file_name(file.name);
    const model_match = model_lookup.get(parsed_file.fingerprint) || null;
    let size_bytes = null;
    let stat_error = '';

    try {
      const stat = await data_fs.stat(file.path);
      const stat_size = Number(stat?.size);
      if (Number.isFinite(stat_size) && stat_size >= 0) {
        size_bytes = stat_size;
      } else {
        stat_error = 'File size was not returned by stat.';
      }
    } catch (error) {
      stat_error = error?.message || String(error);
    }

    return {
      collection_key,
      data_dir,
      file_name: file.name,
      path: file.path,
      fingerprint: parsed_file.fingerprint,
      suffix: parsed_file.suffix,
      file_kind: get_vector_file_kind(parsed_file.suffix),
      active: file.name === active_file,
      size_bytes,
      stat_error,
      configured: Boolean(model_match),
      model_names: model_match?.model_names || [],
      provider_keys: model_match?.provider_keys || [],
      model_keys: model_match?.model_keys || [],
      fingerprint_type: model_match?.fingerprint_type || 'unknown',
    };
  }));

  return { files, errors };
}

/**
 * @param {Map<string, object>} lookup
 * @param {string} fingerprint
 * @param {object} model_record
 * @param {boolean} legacy
 * @returns {void}
 */
function add_model_fingerprint(
  lookup,
  fingerprint,
  model_record,
  legacy,
) {
  if (!fingerprint) return;

  const existing = lookup.get(fingerprint) || {
    model_names: [],
    provider_keys: [],
    model_keys: [],
    has_current: false,
    has_legacy: false,
  };
  add_unique(existing.model_names, model_record.model_name);
  add_unique(existing.provider_keys, model_record.provider_key);
  add_unique(existing.model_keys, model_record.model_key);
  if (legacy) existing.has_legacy = true;
  else existing.has_current = true;
  existing.fingerprint_type = existing.has_current && existing.has_legacy
    ? 'current-and-legacy'
    : existing.has_legacy
      ? 'legacy'
      : 'current'
  ;
  lookup.set(fingerprint, existing);
}

/**
 * @param {object} env
 * @returns {object[]}
 */
function get_configured_embedding_models(env) {
  const items = Object.values(env?.embedding_models?.items || {})
    .filter((model_item) => model_item && !model_item.deleted)
  ;
  const active_models = [
    get_active_embedding_model(env?.smart_sources?.embeddings),
    get_active_embedding_model(env?.smart_blocks?.embeddings),
  ];
  active_models.forEach((active_model) => {
    if (active_model && !items.includes(active_model) && !active_model.deleted) {
      items.push(active_model);
    }
  });
  return items;
}

/**
 * @param {object} embeddings
 * @returns {object|null}
 */
function get_active_embedding_model(embeddings) {
  try {
    return embeddings?.embed_model_item || null;
  } catch {
    return null;
  }
}

/**
 * @param {object} model_item
 * @returns {{model_name: string, provider_key: string, model_key: string}}
 */
function build_model_record(model_item) {
  const data = model_item?.data || {};
  const provider_key = String(data.provider_key || model_item?.provider_key || '');
  const model_key = String(data.model_key || model_item?.model_key || '');
  let provider_model_name = '';
  let display_name = '';

  try {
    provider_model_name = model_item?.ProviderAdapterClass
      ?.defaults
      ?.models
      ?.[model_key]
      ?.name || ''
    ;
  } catch {
    provider_model_name = '';
  }

  try {
    display_name = model_item?.display_name || '';
  } catch {
    display_name = '';
  }

  const model_name = first_non_empty_string([
    data.name,
    data.meta?.name,
    provider_model_name,
    display_name,
    [provider_key, model_key].filter(Boolean).join(' - '),
    model_key,
    provider_key,
    'Unnamed embedding model',
  ]);

  return {
    model_name,
    provider_key,
    model_key,
  };
}

/**
 * @param {object|string} file
 * @param {string} data_dir
 * @returns {{name: string, path: string}}
 */
function normalize_listed_file(file, data_dir) {
  const listed_path = typeof file === 'string'
    ? file
    : String(file?.path || file?.name || '')
  ;
  const normalized_listed_path = listed_path.replace(/\\/g, '/');
  const name = typeof file === 'object' && file?.name
    ? String(file.name)
    : get_path_basename(normalized_listed_path)
  ;
  const path = normalized_listed_path.includes('/')
    ? normalized_listed_path
    : [data_dir, normalized_listed_path || name].filter(Boolean).join('/')
  ;
  return { name, path };
}

/**
 * @param {string} file_name
 * @returns {{fingerprint: string, suffix: string}}
 */
function parse_vector_file_name(file_name) {
  const suffix_i = file_name.indexOf('.');
  if (suffix_i === -1) {
    return {
      fingerprint: file_name,
      suffix: '',
    };
  }
  return {
    fingerprint: file_name.slice(0, suffix_i),
    suffix: file_name.slice(suffix_i),
  };
}

/**
 * @param {string} suffix
 * @returns {'canonical'|'backup'|'temporary'|'related'}
 */
function get_vector_file_kind(suffix) {
  if (!suffix) return 'canonical';
  if (/^\.(?:backup|bak)(?:\.|$)/i.test(suffix)) return 'backup';
  if (/\.tmp(?:\.|$)/i.test(suffix)) return 'temporary';
  return 'related';
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compare_vector_files(a, b) {
  if (a.active !== b.active) return a.active ? -1 : 1;
  if (a.configured !== b.configured) return a.configured ? -1 : 1;
  const collection_comparison = a.collection_key.localeCompare(b.collection_key);
  if (collection_comparison) return collection_comparison;
  const model_comparison = (a.model_names[0] || '').localeCompare(
    b.model_names[0] || '',
  );
  if (model_comparison) return model_comparison;
  return a.file_name.localeCompare(b.file_name);
}

/**
 * @param {string[]} values
 * @param {string} value
 * @returns {void}
 */
function add_unique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

/**
 * @param {*} values
 * @returns {string}
 */
function first_non_empty_string(values) {
  return values
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim() || ''
  ;
}

/**
 * @param {string} path
 * @returns {string}
 */
function get_path_basename(path) {
  return String(path || '').replace(/\\/g, '/').split('/').pop() || '';
}
