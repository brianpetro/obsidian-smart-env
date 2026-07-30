import { DefaultEntitiesVectorAdapter } from 'smart-entities/adapters/default.js';
import { murmur_hash_32_alphanumeric } from 'smart-utils/create_hash.js';
import {
  DEFAULT_EMBEDDING_TYPE,
  delete_embedding_ref,
  ensure_embedding_data,
  get_embedding_ref,
  get_embedding_refs,
  migrate_embedding_refs,
  prune_legacy_embedding_data,
  set_embedding_ref,
} from '../utils/embedding_item.js';

const EMBEDDING_SAVE_CHECKPOINT_SIZE = 1000;

class EmbeddingsVectorAdapter extends DefaultEntitiesVectorAdapter {
  process_embed_queue() {
    if (this._process_embed_queue_promise) {
      this._rerun_embed_queue = true;
      return this._process_embed_queue_promise;
    }

    this._process_embed_queue_promise = (async () => {
      try {
        do {
          this._rerun_embed_queue = false;
          await this.process_embed_queue_once();
          if (this._rerun_embed_queue) {
            this.collection?.mark_embed_queue_dirty?.();
          }
        } while (this._rerun_embed_queue);
      } finally {
        this._process_embed_queue_promise = null;
      }
    })();

    return this._process_embed_queue_promise;
  }

  async process_embed_queue_once() {
    const embed_queue = this.collection?.embed_queue || [];
    if (!embed_queue.length) return;

    const owns_embed_run = !this._is_processing_embed_queue;
    if (owns_embed_run) this._stored_since_checkpoint = 0;
    const collections = get_embed_queue_collections(this.collection);
    const previous_defer_states = collections.map((collection) => ({
      collection,
      defer_embed_saves: collection?._defer_embed_saves,
      defer_vector_saves: collection?.embeddings?.defer_vector_saves,
    }));

    collections.forEach((collection) => {
      collection._defer_embed_saves = true;
      if (collection.embeddings) collection.embeddings.defer_vector_saves = true;
    });

    try {
      const items_by_embeddings = new Map();
      embed_queue.forEach((item) => {
        const embeddings = item?.collection?.embeddings || this.collection?.embeddings;
        if (!embeddings) return;
        if (!items_by_embeddings.has(embeddings)) items_by_embeddings.set(embeddings, []);
        items_by_embeddings.get(embeddings).push(item);
      });

      for (const [embeddings, embedding_items] of items_by_embeddings) {
        await embeddings.load_vectors();
        const file_info = embeddings.get_active_file_info();
        let expected_new_rows = 0;
        for (const item of embedding_items) {
          if (!embeddings.has_current_vector_ref(
            item,
            DEFAULT_EMBEDDING_TYPE,
            file_info,
          )) {
            expected_new_rows += 1;
          }
        }
        if (expected_new_rows) {
          await embeddings.reserve_vector_capacity(expected_new_rows, file_info.file);
        }
      }

      return await super.process_embed_queue();
    } finally {
      previous_defer_states.forEach((state) => {
        const collection = state.collection;
        if (!collection) return;
        collection._defer_embed_saves = state.defer_embed_saves;
        if (collection.embeddings) {
          collection.embeddings.defer_vector_saves = state.defer_vector_saves;
        }
      });

      try {
        for (const state of previous_defer_states) {
          const embeddings = state.collection?.embeddings;
          if (!embeddings) continue;
          embeddings.clear_save_timeout();
          await embeddings.save_dirty_files();
        }

        for (const collection of collections.slice().reverse()) {
          if (!collection?.process_save_queue) continue;
          await collection.process_save_queue();
        }
      } finally {
        if (owns_embed_run) this._stored_since_checkpoint = 0;
      }
    }
  }

  async embed_batch(items = []) {
    if (this._stored_since_checkpoint >= EMBEDDING_SAVE_CHECKPOINT_SIZE) {
      await this.flush_embed_checkpoint();
      this._stored_since_checkpoint = 0;
    }

    const groups = new Map();
    items.forEach((item, item_i) => {
      const embeddings = item?.collection?.embeddings || this.collection.embeddings;
      if (!embeddings) {
        const message = `No embeddings manager found for ${item?.key || 'item'}.`;
        mark_embedding_error(item, message);
        throw new Error(message);
      }
      if (!groups.has(embeddings)) groups.set(embeddings, []);
      groups.get(embeddings).push({ item, item_i });
    });

    const results = new Array(items.length);
    let stored_count = 0;
    for (const [embeddings, group_entries] of groups) {
      const group_items = group_entries.map((entry) => entry.item);
      const group_results = await embeddings.embed_batch(group_items);
      if (!Array.isArray(group_results) || group_results.length !== group_items.length) {
        const result_count = Array.isArray(group_results) ? group_results.length : 0;
        const message = `Embedding batch returned ${result_count} results for ${group_items.length} items.`;
        group_items.forEach((item) => mark_embedding_error(item, message));
        throw new Error(message);
      }
      group_results.forEach((result, group_i) => {
        const entry = group_entries[group_i];
        results[entry.item_i] = result;
      });
      stored_count += group_results.reduce((count, result) => {
        return count + (result?.skipped ? 0 : 1);
      }, 0);
    }

    this._stored_since_checkpoint = (this._stored_since_checkpoint || 0) + stored_count;
    return results;
  }

  async flush_embed_checkpoint() {
    const collections = get_embed_queue_collections(this.collection);

    for (const collection of collections) {
      if (!collection?.embeddings) continue;
      collection.embeddings.clear_save_timeout();
      await collection.embeddings.save_dirty_files();
    }

    const defer_states = collections.map((collection) => ({
      collection,
      defer_embed_saves: collection?._defer_embed_saves,
    }));
    collections.forEach((collection) => {
      collection._defer_embed_saves = false;
    });

    try {
      for (const collection of collections.slice().reverse()) {
        if (!collection?.process_save_queue) continue;
        await collection.process_save_queue();
      }
    } finally {
      defer_states.forEach((state) => {
        state.collection._defer_embed_saves = state.defer_embed_saves;
      });
    }
  }
}

export class Embeddings {
  static version = 2;

  constructor(scope, opts = {}) {
    this.env = scope?.collection_key ? scope.env : scope;
    this.collection = scope?.collection_key ? scope : opts.collection || null;
    this._vectors_by_file = {};
    this._dims_by_file = {};
    this._vector_lengths_by_file = {};
    this._persisted_lengths_by_file = {};
    this._dirty_files = new Set();
    this._rewrite_files = new Set();
    this._save_timeout = null;
    this._save_dirty_files_promise = null;
    this.defer_vector_saves = false;
    this._unloaded = false;
  }

  for_collection(collection) {
    return new Embeddings(collection);
  }

  get entities_vector_adapter() {
    if (!this._entities_vector_adapter) {
      this._entities_vector_adapter = new EmbeddingsVectorAdapter(this.collection);
    }
    return this._entities_vector_adapter;
  }

  get data_fs() {
    return this.collection?.data_fs || this.env?.data_fs;
  }

  get data_dir() {
    return this.collection?.data_dir || this.collection?.collection_key || 'embeddings';
  }

  get embed_model() {
    return this.collection?.embed_model || null;
  }

  get embed_model_item() {
    return this.env?.embedding_models?.default || null;
  }

  get embed_model_data() {
    return this.embed_model_item?.data || {};
  }

  get embed_model_key() {
    return this.embed_model_data.model_key || this.embed_model_item?.model_key || '';
  }

  get embedding_space_id() {
    const models = this.embed_model_item?.ProviderAdapterClass?.defaults?.models;
    return models?.[this.embed_model_key]?.semantic_profile?.embedding_space_id || '';
  }

  get_model_fingerprint_key(embedding_space_id = '') {
    const model_data = this.embed_model_data;
    const fingerprint_data = {
      provider_key: model_data.provider_key || '',
      model_key: model_data.model_key || this.embed_model_key || '',
      dimensions: model_data.dimensions || model_data.dims || '',
      max_tokens: Number(model_data.max_tokens || 0),
    };
    if (embedding_space_id) {
      fingerprint_data.embedding_space_id = embedding_space_id;
    }
    return JSON.stringify(fingerprint_data);
  }

  get legacy_model_fingerprint() {
    return `mf_${murmur_hash_32_alphanumeric(this.get_model_fingerprint_key())}`;
  }

  get dims() {
    const dims = Number(
      this.embed_model_data.dimensions
      || this.embed_model_data.dims
      || this._dims_by_file[this.active_file]
      || 0
    );
    return Number.isFinite(dims) && dims > 0 ? dims : 0;
  }

  get model_fingerprint() {
    const fingerprint_key = this.get_model_fingerprint_key(this.embedding_space_id);
    if (this._model_fingerprint_key !== fingerprint_key) {
      this._model_fingerprint_key = fingerprint_key;
      this._model_fingerprint = `mf_${murmur_hash_32_alphanumeric(fingerprint_key)}`;
    }
    return this._model_fingerprint;
  }

  get active_file() {
    return this.model_fingerprint;
  }

  get_active_file_info(file = this.active_file) {
    const dims = this._dims_by_file[file] || this.dims;
    return {
      model_fingerprint: this.model_fingerprint,
      file,
      dims,
      value_count: this.get_vector_value_count(file),
    };
  }

  get_file_path(file = this.active_file) {
    return `${this.data_dir}/${file}`;
  }

  get_item_embedding_ref(
    item,
    type = DEFAULT_EMBEDDING_TYPE,
    model_fingerprint = this.model_fingerprint,
  ) {
    if (migrate_embedding_refs(item, type)) item.queue_save?.();
    return get_embedding_ref(item, type, model_fingerprint);
  }

  get_item_embedding_refs(item, type = DEFAULT_EMBEDDING_TYPE) {
    if (migrate_embedding_refs(item, type)) item.queue_save?.();
    return get_embedding_refs(item, type);
  }

  async flush() {
    this.clear_save_timeout();
    await this.save_dirty_files();
  }

  async unload() {
    this._unloaded = true;
    await this.flush();
    this.clear_runtime_cache();
  }

  clear_runtime_cache() {
    this.clear_save_timeout();
    this._vectors_by_file = {};
    this._dims_by_file = {};
    this._vector_lengths_by_file = {};
    this._persisted_lengths_by_file = {};
    this._dirty_files.clear();
    this._rewrite_files.clear();
    this._entities_vector_adapter?._reset_embed_queue_stats?.();
    this._entities_vector_adapter = null;
  }

  async embed_batch(items = [], type = DEFAULT_EMBEDDING_TYPE) {
    const embed_model = this.embed_model;
    if (!embed_model) {
      throw new Error(`No embed_model found for ${this.collection?.collection_key || 'collection'}`);
    }

    const model_fingerprint = this.model_fingerprint;
    const active_file = this.active_file;
    const model_dims = this.dims;
    await this.load_vectors(active_file, model_dims);
    const expected_dims = this._dims_by_file[active_file] || model_dims;

    const prepared_items = [];
    const results = new Array(items.length).fill(null);

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const embed_input = await item.get_embed_input();
      if (!embed_input) continue;
      if (!item.read_hash) {
        const message = `Missing read_hash for ${item?.key || 'item'}.`;
        mark_embedding_error(item, message);
        throw new Error(message);
      }

      let ref = this.get_item_embedding_ref(item, type, model_fingerprint);
      let vector_changed = false;
      if (
        ref?.file
        && ref.file !== active_file
        && ref.read_hash === item.read_hash
        && expected_dims
      ) {
        await this.load_vectors(ref.file, expected_dims);
        if (
          this._dims_by_file[ref.file] === expected_dims
          && this.get_vector_value_count(ref.file) % expected_dims === 0
        ) {
          const legacy_vec = this.get_vector(ref.file, ref.file_i);
          if (legacy_vec) {
            ref = this.set_item_vector(item, legacy_vec, type, {
              model_fingerprint,
              file: active_file,
              read_hash: ref.read_hash,
              at: ref.at,
            });
            vector_changed = Boolean(ref);
          }
        }
      }

      if (
        ref?.file === active_file
        && ref.read_hash === item.read_hash
        && this.has_vector(ref.file, ref.file_i)
      ) {
        item._queue_embed = false;
        item._embed_input = null;
        results[i] = {
          skipped: true,
          vector_changed,
          vec: this.get_vector(ref.file, ref.file_i),
        };
        continue;
      }

      prepared_items.push({
        item,
        item_i: i,
        embed_input,
        type,
      });
    }

    if (!prepared_items.length) return results.filter(Boolean);

    const embeddings = await embed_model.embed_batch(
      prepared_items.map((entry) => ({
        embed_input: entry.embed_input,
        purpose: 'document',
      }))
    );

    let validated_vecs;
    try {
      validated_vecs = validate_embedding_batch(
        embeddings,
        prepared_items.length,
        expected_dims,
      );
    } catch (error) {
      prepared_items.forEach((entry) => {
        mark_embedding_error(entry.item, error?.message || String(error));
      });
      throw error;
    }

    const vector_dims = validated_vecs[0]?.length || expected_dims;
    const value_count = this.get_vector_value_count(active_file);
    if (value_count && value_count % vector_dims !== 0) {
      const message = `Invalid vector file shape for ${active_file}: ${value_count} values cannot form ${vector_dims}-dimension rows.`;
      prepared_items.forEach((entry) => mark_embedding_error(entry.item, message));
      throw new Error(message);
    }

    for (let result_i = 0; result_i < prepared_items.length; result_i += 1) {
      const entry = prepared_items[result_i];
      const result = embeddings[result_i];
      const stored_ref = this.set_item_vector(entry.item, validated_vecs[result_i], entry.type, {
        model_fingerprint,
        file: active_file,
        read_hash: entry.item.read_hash,
      });

      if (!stored_ref) {
        const message = `Failed to store embedding vector for ${entry.item?.key || `item ${result_i + 1}`}.`;
        mark_embedding_error(entry.item, message);
        throw new Error(message);
      }

      results[entry.item_i] = result;
    }

    return results.filter(Boolean);
  }

  get_item_vector(item, type = DEFAULT_EMBEDDING_TYPE) {
    const model_fingerprint = this.model_fingerprint;
    const active_file = this.active_file;
    const ref = this.get_item_embedding_ref(item, type, model_fingerprint);
    if (!ref?.file) return undefined;
    if (ref.file !== active_file) return undefined;
    if (!ref.read_hash || ref.read_hash !== item.read_hash) return undefined;
    return this.get_vector(ref.file, ref.file_i);
  }

  set_item_vector(item, vec, type = DEFAULT_EMBEDDING_TYPE, params = {}) {
    const model_fingerprint = params.model_fingerprint || this.model_fingerprint;
    if (vec === null) {
      if (!delete_embedding_ref(item, type, model_fingerprint)) return null;

      item._embed_input = null;
      item.collection?.mark_embed_queue_dirty?.();
      item.source_collection?.mark_embed_queue_dirty?.();
      item.queue_save?.();
      return null;
    }
    if (!vec?.length) return null;

    const file = params.file || this.active_file;
    const source_vec = vec instanceof Float32Array ? vec : new Float32Array(vec);
    const current_ref = this.get_item_embedding_ref(item, type, model_fingerprint);
    const read_hash = params.read_hash || item.read_hash || '';
    const file_i = (
      current_ref?.file === file
      && current_ref.read_hash === read_hash
      && Number.isInteger(current_ref.file_i)
      && current_ref.file_i >= 0
      && this.has_vector(file, current_ref.file_i)
    )
      ? current_ref.file_i
      : this.append_vector(file, source_vec.length)
    ;

    if (!this.set_vector(file, file_i, source_vec)) return null;

    set_embedding_ref(item, {
      file,
      file_i,
      read_hash,
      at: params.at || Date.now(),
    }, type, model_fingerprint);

    item._queue_embed = false;
    item._embed_input = null;
    prune_legacy_embedding_data(item);
    item.collection?.mark_embed_queue_dirty?.();
    item.source_collection?.mark_embed_queue_dirty?.();
    item.queue_save?.();
    this.queue_save_vectors();
    return get_embedding_ref(item, type, model_fingerprint);
  }

  async migrate_legacy_item_vectors(type = DEFAULT_EMBEDDING_TYPE) {
    if (!this.collection?.items) return 0;

    // Inline vectors predate semantic profiles and belong to the legacy space.
    const migration_model_fingerprint = this.embedding_space_id
      ? this.legacy_model_fingerprint
      : this.model_fingerprint
    ;
    await this.load_vectors(migration_model_fingerprint, this.dims);

    const previous_defer_vector_saves = this.defer_vector_saves;
    this.defer_vector_saves = true;

    let changed_count = 0;
    try {
      Object.values(this.collection.items).forEach((item) => {
        let item_changed = migrate_embedding_refs(item, type);
        const legacy = item.data?.embeddings?.[this.embed_model_key];
        const had_legacy_data = Boolean(item.data?.embeddings || item.data?.last_embed);

        if (legacy?.vec?.length) {
          this.set_item_vector(item, legacy.vec, type, {
            model_fingerprint: migration_model_fingerprint,
            file: migration_model_fingerprint,
            read_hash: legacy.last_embed?.hash || item.data?.last_embed?.hash || item.read_hash || '',
            at: legacy.last_embed?.at || item.data?.last_embed?.at || Date.now(),
          });
          item_changed = true;
        } else if (had_legacy_data) {
          prune_legacy_embedding_data(item);
          item_changed = true;
        }

        if (!item_changed) return;
        item.queue_save?.();
        changed_count += 1;
      });
    } finally {
      this.defer_vector_saves = previous_defer_vector_saves;
    }

    if (changed_count) await this.save_dirty_files();
    return changed_count;
  }

  async load_vectors(file = this.active_file, expected_dims = 0) {
    if (!file) return new Float32Array(0);
    if (this._vectors_by_file[file]) return this._vectors_by_file[file];

    const path = this.get_file_path(file);
    if (!(await this.data_fs.exists(path))) {
      this._vectors_by_file[file] = new Float32Array(0);
      this._vector_lengths_by_file[file] = 0;
      this._persisted_lengths_by_file[file] = 0;
      return this._vectors_by_file[file];
    }

    const raw = await this.data_fs.read_binary(path);
    const buffer = to_array_buffer(raw);
    if (!buffer) {
      const detail = raw?.error ? `: ${raw.error}` : '';
      throw new Error(`Failed to read vector file ${path}${detail}`);
    }
    if (buffer.byteLength % 4 !== 0) {
      throw new Error(`Invalid vector file ${path}: byte length ${buffer.byteLength} is not divisible by 4.`);
    }

    const vectors = new Float32Array(buffer);
    this._vectors_by_file[file] = vectors;
    this._vector_lengths_by_file[file] = vectors.length;
    this._persisted_lengths_by_file[file] = vectors.length;
    this._dims_by_file[file] = this.resolve_file_dims(file, vectors.length, expected_dims);
    return vectors;
  }

  ensure_vectors(file = this.active_file, dims = this.dims) {
    if (!this._vectors_by_file[file]) {
      this._vectors_by_file[file] = new Float32Array(0);
      this._vector_lengths_by_file[file] = 0;
      this._persisted_lengths_by_file[file] = 0;
    }
    if (!Number.isInteger(this._vector_lengths_by_file[file])) {
      this._vector_lengths_by_file[file] = this._vectors_by_file[file].length;
    }
    if (!Number.isInteger(this._persisted_lengths_by_file[file])) {
      this._persisted_lengths_by_file[file] = this._vector_lengths_by_file[file];
    }
    if (dims) this._dims_by_file[file] = dims;
    return this._vectors_by_file[file];
  }

  async reserve_vector_capacity(expected_new_rows = 0, file = this.active_file) {
    if (!Number.isInteger(expected_new_rows) || expected_new_rows <= 0) {
      return this._vectors_by_file[file];
    }

    await this.load_vectors(file);

    const dims = this._dims_by_file[file] || this.dims;
    if (!dims) return this._vectors_by_file[file];

    const active_value_count = this.get_vector_value_count(file);
    return this.ensure_vector_capacity(
      file,
      dims,
      active_value_count + expected_new_rows * dims,
    );
  }

  ensure_vector_capacity(file, dims, min_value_count) {
    const vectors = this.ensure_vectors(file, dims);
    if (vectors.length >= min_value_count) return vectors;

    let next_length = vectors.length || 0;
    while (next_length < min_value_count) {
      next_length = next_length ? next_length * 2 : dims;
    }

    const active_value_count = this.get_vector_value_count(file);
    const next_vectors = new Float32Array(next_length);
    next_vectors.set(vectors.subarray(0, active_value_count));
    this._vectors_by_file[file] = next_vectors;
    return next_vectors;
  }

  append_vector(file = this.active_file, dims = this.dims) {
    dims = Number(dims || 0);
    if (!dims) return -1;

    const existing_dims = this._dims_by_file[file];
    if (existing_dims && existing_dims !== dims) {
      console.warn(`[embeddings] Vector dims changed for ${file}; refusing to append incompatible row.`);
      return -1;
    }

    const value_count = this.get_vector_value_count(file);
    if (value_count % dims !== 0) {
      console.warn(`[embeddings] Vector file ${file} has incomplete rows for ${dims} dims.`);
      return -1;
    }

    const file_i = value_count / dims;
    this.ensure_vector_capacity(file, dims, value_count + dims);
    this._vector_lengths_by_file[file] = value_count + dims;
    return file_i;
  }

  set_vector(file, file_i, vec) {
    const source_vec = vec instanceof Float32Array ? vec : new Float32Array(vec || []);
    const dims = this._dims_by_file[file] || this.dims || source_vec.length;
    if (!Number.isInteger(file_i) || file_i < 0 || !dims) return false;
    if (source_vec.length !== dims) {
      console.warn(`[embeddings] Skipping incompatible vector for ${file}: ${source_vec.length} != ${dims}`);
      return false;
    }

    const start = file_i * dims;
    const end = start + dims;
    if (end > this.get_vector_value_count(file)) return false;

    const vectors = this.ensure_vector_capacity(file, dims, end);
    vectors.set(source_vec, start);
    if (start < (this._persisted_lengths_by_file[file] || 0)) {
      this._rewrite_files.add(file);
    }
    this._dirty_files.add(file);
    return true;
  }

  get_vector(file, file_i) {
    const vectors = this._vectors_by_file[file];
    const dims = this._dims_by_file[file] || this.dims;
    if (!vectors || !Number.isInteger(file_i) || file_i < 0 || !dims) return undefined;

    const start = file_i * dims;
    const end = start + dims;
    if (end > this.get_vector_value_count(file)) return undefined;
    return vectors.subarray(start, end);
  }

  has_vector(file, file_i) {
    return Boolean(this.get_vector(file, file_i));
  }

  has_current_vector_ref(item, type = DEFAULT_EMBEDDING_TYPE, file_info = null) {
    const model_fingerprint = file_info?.model_fingerprint || this.model_fingerprint;
    const file = file_info?.file || this.active_file;
    const ref = this.get_item_embedding_ref(item, type, model_fingerprint);
    if (ref?.file !== file || !Number.isInteger(ref.file_i) || ref.file_i < 0) return false;
    if (!ref.read_hash || ref.read_hash !== item.read_hash) return false;

    const dims = file_info?.dims || this._dims_by_file[file] || this.dims;
    const value_count = Number.isInteger(file_info?.value_count)
      ? file_info.value_count
      : this.get_vector_value_count(file)
    ;
    if (!dims || !value_count) return false;

    const end = (ref.file_i + 1) * dims;
    return end <= value_count;
  }

  resolve_file_dims(file, vector_value_count = 0, expected_dims = 0) {
    if (expected_dims) return expected_dims;
    if (this.dims) return this.dims;
    const row_count = this.get_file_row_count(file);
    if (row_count && vector_value_count % row_count === 0) {
      return vector_value_count / row_count;
    }
    return this._dims_by_file[file] || 0;
  }

  get_file_row_count(file) {
    return Object.values(this.collection?.items || {}).reduce((max_file_i, item) => {
      const refs = this.get_item_embedding_refs(item);
      Object.values(refs).forEach((ref) => {
        if (ref?.file !== file || !Number.isInteger(ref.file_i)) return;
        max_file_i = Math.max(max_file_i, ref.file_i + 1);
      });
      return max_file_i;
    }, 0);
  }

  get_vector_value_count(file = this.active_file) {
    const value_count = this._vector_lengths_by_file[file];
    if (Number.isInteger(value_count) && value_count >= 0) return value_count;
    return this._vectors_by_file[file]?.length || 0;
  }

  queue_save_vectors() {
    if (this.defer_vector_saves || this._unloaded) return;
    if (this._save_timeout) clearTimeout(this._save_timeout);
    this._save_timeout = setTimeout(() => {
      this._save_timeout = null;
      this.save_dirty_files().catch((error) => {
        console.warn('[embeddings] Failed to save vector file', error);
      });
    }, 100);
  }

  clear_save_timeout() {
    if (!this._save_timeout) return;
    clearTimeout(this._save_timeout);
    this._save_timeout = null;
  }

  async save_dirty_files() {
    if (this._save_dirty_files_promise) return await this._save_dirty_files_promise;

    this._save_dirty_files_promise = this._save_dirty_files();
    try {
      return await this._save_dirty_files_promise;
    } finally {
      this._save_dirty_files_promise = null;
    }
  }

  async _save_dirty_files() {
    if (!this._dirty_files.size) return;

    while (this._dirty_files.size) {
      const dirty_files = Array.from(this._dirty_files);
      for (const file of dirty_files) {
        if (!this._dirty_files.delete(file)) continue;
        try {
          await this.save_vectors(file);
        } catch (error) {
          this._dirty_files.add(file);
          throw error;
        }
      }
    }
  }

  async save_vectors(file = this.active_file) {
    const vectors = this._vectors_by_file[file];
    if (!vectors) return;

    await this.ensure_data_dir();

    const path = this.get_file_path(file);
    const value_count = this.get_vector_value_count(file);
    const persisted_value_count = this._persisted_lengths_by_file[file] || 0;
    const can_append = await this.can_append_vectors(file, persisted_value_count, value_count);
    const should_rewrite = this._rewrite_files.has(file);

    if (can_append && !should_rewrite) {
      try {
        await this.data_fs.append_binary(
          path,
          this.get_vectors_buffer(file, persisted_value_count, value_count)
        );
      } catch (error) {
        console.warn('[embeddings] append_binary failed; rewriting vector file', {
          path,
          error,
        });
        await this.write_vectors_file(path, this.get_vectors_buffer(file, 0, value_count));
      }
    } else {
      await this.write_vectors_file(path, this.get_vectors_buffer(file, 0, value_count));
    }

    this._persisted_lengths_by_file[file] = value_count;
    this._rewrite_files.delete(file);
  }

  async write_vectors_file(path, buffer) {
    const temp_path = `${path}.tmp`;
    await this.data_fs.write_binary(temp_path, buffer);
    await replace_file_with_temp(this.data_fs, temp_path, path);
  }

  get_vectors_buffer(file, start_value_count, end_value_count) {
    const vectors = this._vectors_by_file[file];
    const start_byte = vectors.byteOffset + (start_value_count * 4);
    const end_byte = vectors.byteOffset + (end_value_count * 4);
    return vectors.buffer.slice(start_byte, end_byte);
  }

  async can_append_vectors(file, persisted_value_count, value_count) {
    if (!persisted_value_count || value_count <= persisted_value_count) return false;
    if (typeof this.data_fs?.append_binary !== 'function') return false;
    return await this.data_fs.exists(this.get_file_path(file));
  }

  async ensure_data_dir() {
    if (!(await this.data_fs.exists(this.data_dir))) {
      await this.data_fs.mkdir(this.data_dir);
    }
  }
}


function validate_embedding_batch(embeddings, expected_count, expected_dims = 0) {
  if (!Array.isArray(embeddings)) {
    throw new Error('Embedding model returned an invalid batch response.');
  }

  if (embeddings.length !== expected_count) {
    throw new Error(`Embedding model returned ${embeddings.length} results for ${expected_count} items.`);
  }

  const validated_vecs = new Array(expected_count);
  let dims = Number(expected_dims || 0);

  for (let result_i = 0; result_i < embeddings.length; result_i += 1) {
    const result = embeddings[result_i];
    if (result?.error) {
      throw new Error(`Embedding result ${result_i} failed: ${String(result.error)}`);
    }
    if (!result?.vec?.length) {
      throw new Error(`Embedding result ${result_i} is missing a vector.`);
    }

    let vec;
    try {
      vec = result.vec instanceof Float32Array
        ? result.vec
        : new Float32Array(result.vec)
      ;
    } catch {
      throw new Error(`Embedding result ${result_i} contains an invalid vector.`);
    }

    if (!dims) dims = vec.length;
    if (vec.length !== dims) {
      throw new Error(`Embedding result ${result_i} has ${vec.length} dimensions; expected ${dims}.`);
    }

    let squared_sum = 0;
    for (let value_i = 0; value_i < vec.length; value_i += 1) {
      const value = vec[value_i];
      if (!Number.isFinite(value)) {
        throw new Error(`Embedding result ${result_i} contains non-finite values.`);
      }
      squared_sum += value * value;
    }

    if (!Number.isFinite(squared_sum) || squared_sum <= 0) {
      throw new Error(`Embedding result ${result_i} has zero magnitude.`);
    }

    validated_vecs[result_i] = vec;
  }

  return validated_vecs;
}

function mark_embedding_error(item, message) {
  ensure_embedding_data(item).error = message;
  item._queue_embed = true;
  item._embed_input = null;
  item.collection?.mark_embed_queue_dirty?.();
  item.source_collection?.mark_embed_queue_dirty?.();
  item.queue_save?.();
}

function get_embed_queue_collections(collection) {
  const collections = [];
  if (collection) collections.push(collection);
  if (collection?.block_collection && collection.block_collection !== collection) {
    collections.push(collection.block_collection);
  }
  return collections;
}

function to_array_buffer(raw) {
  if (!raw) return null;
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    if (raw.byteOffset === 0 && raw.byteLength === raw.buffer.byteLength) return raw.buffer;
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  }
  return null;
}

async function replace_file_with_temp(fs, temp_path, final_path) {
  const backup_path = `${final_path}.bak`;

  if (await fs.exists(backup_path)) await remove_file(fs, backup_path);
  if (await fs.exists(final_path)) await rename_file(fs, final_path, backup_path);

  try {
    await rename_file(fs, temp_path, final_path);
  } catch (error) {
    if (await fs.exists(backup_path)) await rename_file(fs, backup_path, final_path);
    throw error;
  }

  if (await fs.exists(backup_path)) await remove_file(fs, backup_path);
}

async function rename_file(fs, old_path, new_path) {
  if (typeof fs.adapter?.rename === 'function') {
    return await fs.adapter.rename(old_path, new_path);
  }
  return await fs.rename(old_path, new_path);
}

async function remove_file(fs, path) {
  if (typeof fs.adapter?.remove === 'function') {
    return await fs.adapter.remove(path);
  }
  return await fs.remove(path);
}

export default {
  class: Embeddings,
  version: Embeddings.version,
};
