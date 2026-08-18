import test from 'ava';
import { get_embedding_model_fingerprint } from '../modules/embeddings.js';
import {
  build_embedding_model_lookup,
  collect_vector_file_stats,
} from './vector_file_stats.js';

function create_model(params = {}) {
  const data = {
    provider_key: params.provider_key || 'transformers',
    model_key: params.model_key || 'sentence-transformers/all-MiniLM-L6-v2',
    dims: params.dims || 384,
    max_tokens: params.max_tokens || 256,
    ...(params.data || {}),
  };
  return {
    data,
    ProviderAdapterClass: {
      defaults: {
        models: {
          [data.model_key]: {
            name: params.provider_model_name || 'All MiniLM L6 v2',
            semantic_profile: params.embedding_space_id
              ? { embedding_space_id: params.embedding_space_id }
              : {},
          },
        },
      },
    },
    get display_name() {
      return data.meta?.name || `${data.provider_key} - ${data.model_key}`;
    },
  };
}

function create_data_fs(files_by_dir) {
  const stat_paths = [];
  return {
    stat_paths,
    async list_files(data_dir) {
      return Object.keys(files_by_dir)
        .filter((path) => path.startsWith(`${data_dir}/`))
        .map((path) => ({
          name: path.split('/').pop(),
          path,
        }));
    },
    async stat(path) {
      stat_paths.push(path);
      const size = files_by_dir[path];
      if (size instanceof Error) throw size;
      return { size };
    },
  };
}

function create_env(params = {}) {
  const model = params.model || create_model();
  const current_fingerprint = get_embedding_model_fingerprint(model);
  const data_fs = params.data_fs || create_data_fs({
    [`smart_sources/${current_fingerprint}`]: 1024,
  });
  const create_collection = (collection_key) => ({
    collection_key,
    data_dir: collection_key,
    data_fs,
    embeddings: {
      active_file: current_fingerprint,
      data_dir: collection_key,
      data_fs,
      embed_model_item: model,
    },
  });
  return {
    embedding_models: {
      items: { model },
    },
    smart_sources: create_collection('smart_sources'),
    smart_blocks: create_collection('smart_blocks'),
  };
}

test('configured model lookup includes current and legacy fingerprints', (t) => {
  const model = create_model({
    data: {
      name: 'Configured name',
    },
    embedding_space_id: 'retrieval-v1',
  });
  const env = create_env({ model });
  const lookup = build_embedding_model_lookup(env);
  const current_fingerprint = get_embedding_model_fingerprint(model);
  const legacy_fingerprint = get_embedding_model_fingerprint(
    model,
    { legacy: true },
  );

  t.deepEqual(lookup.get(current_fingerprint).model_names, ['Configured name']);
  t.is(lookup.get(current_fingerprint).fingerprint_type, 'current');
  t.deepEqual(lookup.get(legacy_fingerprint).model_names, ['Configured name']);
  t.is(lookup.get(legacy_fingerprint).fingerprint_type, 'legacy');
});

test('vector file stats list canonical, backup, and temporary files using stat', async (t) => {
  const model = create_model({
    data: {
      meta: { name: 'Vault embeddings' },
    },
  });
  const fingerprint = get_embedding_model_fingerprint(model);
  const data_fs = create_data_fs({
    [`smart_sources/${fingerprint}`]: 1024,
    [`smart_sources/${fingerprint}.backup`]: 2048,
    [`smart_blocks/${fingerprint}.optimize.tmp`]: 512,
    'smart_blocks/data.ajson': 999,
  });
  const env = create_env({ model, data_fs });

  const result = await collect_vector_file_stats(env);

  t.is(result.files.length, 3);
  t.is(result.total_bytes, 3584);
  t.is(result.unknown_size_count, 0);
  t.deepEqual(
    data_fs.stat_paths.sort(),
    [
      `smart_blocks/${fingerprint}.optimize.tmp`,
      `smart_sources/${fingerprint}`,
      `smart_sources/${fingerprint}.backup`,
    ].sort(),
  );
  t.deepEqual(
    result.files.map((file) => file.file_kind).sort(),
    ['backup', 'canonical', 'temporary'],
  );
  t.true(result.files.every((file) => file.configured));
  t.true(result.files.every((file) => (
    file.model_names[0] === 'Vault embeddings'
  )));
  t.true(result.files.some((file) => file.active));
});

test('unrecognized hashes and stat failures remain visible', async (t) => {
  const data_fs = create_data_fs({
    'smart_sources/mf_unknown': new Error('stat failed'),
  });
  const env = create_env({ data_fs });

  const result = await collect_vector_file_stats(env);
  const [file] = result.files;

  t.is(result.files.length, 1);
  t.false(file.configured);
  t.is(file.size_bytes, null);
  t.is(file.stat_error, 'stat failed');
  t.is(result.unknown_size_count, 1);
});
