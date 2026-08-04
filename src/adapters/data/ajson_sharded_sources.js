import { AjsonSingleFileCollectionDataAdapter } from 'smart-collections/adapters/ajson_single_file.js';
import { Notice, Platform } from 'obsidian';
import { has_legacy_embedding_refs } from '../../utils/embedding_item.js';

const class_to_collection_key = {
  SmartSource: 'smart_sources',
  SmartNote: 'smart_sources',
  SmartBlock: 'smart_blocks',
  SmartDirectory: 'smart_directories',
};

const AJSON_LINE_CHUNK_SIZE = 1000;
const AJSON_MAX_BYTES_PER_SHARD = Platform.isMobile
  ? 8 * 1024 * 1024
  : 64 * 1024 * 1024
;
const AJSON_FILE_SCAN_LIMIT = 10000;
const MATERIALIZE_YIELD_EVERY = 20000;
const LEGACY_LOAD_YIELD_EVERY = 25;
const utf8_encoder = new TextEncoder();

/**
 * Sequentially sharded append-only source log.
 *
 * Shards are replayed by numeric index and physical line order, so the last
 * valid record for a source key is authoritative. Shard 0 is also the
 * committed-format marker used by the legacy migration path.
 */
export class AjsonShardedSourcesDataAdapter extends AjsonSingleFileCollectionDataAdapter {
  get legacy_data_dir() {
    return 'multi';
  }

  get max_bytes_per_shard() {
    return AJSON_MAX_BYTES_PER_SHARD;
  }

  get_ajson_file_name(file_i = 0) {
    const collection_key = this.collection.collection_key;
    return file_i > 0
      ? `${collection_key}_${file_i}.ajson`
      : `${collection_key}.ajson`
    ;
  }

  get_item_data_path(_key = '', file_i = 0) {
    return `${this.collection.data_dir}/${this.get_ajson_file_name(file_i)}`;
  }

  get_ajson_file_path(file_i = 0) {
    return this.get_item_data_path('', file_i);
  }

  get_ajson_file_i_from_path(file_path = '') {
    const file_name = get_path_basename(file_path);
    const collection_key = this.collection.collection_key;
    if (file_name === `${collection_key}.ajson`) return 0;

    const numbered_prefix = `${collection_key}_`;
    if (!file_name.startsWith(numbered_prefix) || !file_name.endsWith('.ajson')) return null;

    const file_i = Number(file_name.slice(numbered_prefix.length, -'.ajson'.length));
    return Number.isInteger(file_i) && file_i > 0 ? file_i : null;
  }

  get_ajson_file_info(file_i = 0, size_bytes = 0, record_count = 0) {
    return {
      file_i,
      path: this.get_ajson_file_path(file_i),
      size_bytes: Number.isFinite(size_bytes) && size_bytes > 0 ? size_bytes : 0,
      record_count: Number.isInteger(record_count) && record_count > 0 ? record_count : 0,
    };
  }

  async ensure_data_dir() {
    if (!(await this.fs.exists(this.collection.data_dir))) {
      await this.fs.mkdir(this.collection.data_dir);
    }
  }

  async ensure_ajson_file(file_i = 0) {
    await this.ensure_data_dir();
    const data_path = this.get_ajson_file_path(file_i);
    if (!(await this.fs.exists(data_path))) {
      await this.fs.write(data_path, '');
    }
  }

  async list_ajson_data_files(params = {}) {
    const {
      require_base = true,
    } = params;
    const cached_record_counts = new Map(
      (this._ajson_file_infos || []).map((info) => [info.file_i, info.record_count || 0])
    );
    const infos_by_i = new Map();
    const add_info = (file_path = '') => {
      const file_i = this.get_ajson_file_i_from_path(file_path);
      if (file_i === null) return;
      infos_by_i.set(file_i, this.get_ajson_file_info(
        file_i,
        0,
        cached_record_counts.get(file_i) || 0,
      ));
    };

    const base_path = this.get_ajson_file_path(0);
    const has_base_file = await this.fs.exists(base_path);
    if (!has_base_file && require_base) return [];
    if (has_base_file) add_info(base_path);

    try {
      if (typeof this.fs.list === 'function' && await this.fs.exists(this.collection.data_dir)) {
        const files = await this.fs.list(this.collection.data_dir);
        (files || []).forEach((file) => {
          const file_path = typeof file === 'string'
            ? file
            : file?.path || file?.name || ''
          ;
          if (!file_path) return;
          add_info(file_path.includes('/') || file_path.includes('\\')
            ? file_path
            : `${this.collection.data_dir}/${file_path}`
          );
        });
      }
    } catch (error) {
      console.warn('AjsonShardedSourcesDataAdapter: failed to list AJSON shards', error);
    }

    for (let file_i = 1; file_i < AJSON_FILE_SCAN_LIMIT; file_i += 1) {
      if (infos_by_i.has(file_i)) continue;
      const path = this.get_ajson_file_path(file_i);
      if (!(await this.fs.exists(path))) break;
      infos_by_i.set(file_i, this.get_ajson_file_info(
        file_i,
        0,
        cached_record_counts.get(file_i) || 0,
      ));
    }

    const infos = Array.from(infos_by_i.values())
      .sort((left, right) => left.file_i - right.file_i)
    ;

    for (const info of infos) {
      const stat = await this.fs.stat(info.path);
      info.size_bytes = Number(stat.size || 0);
    }
    this._ajson_file_infos = infos.map((info) => ({ ...info }));

    return infos;
  }

  upsert_ajson_file_info(next_info) {
    if (!next_info) return;
    if (!Array.isArray(this._ajson_file_infos)) this._ajson_file_infos = [];

    const existing_i = this._ajson_file_infos.findIndex((info) => info.file_i === next_info.file_i);
    if (existing_i === -1) {
      this._ajson_file_infos.push({ ...next_info });
    } else {
      this._ajson_file_infos[existing_i] = {
        ...this._ajson_file_infos[existing_i],
        ...next_info,
      };
    }

    this._ajson_file_infos.sort((left, right) => left.file_i - right.file_i);
  }

  should_rotate_append_file(file_info, pending_size_bytes = 0, pending_record_count = 1) {
    if (!file_info) return true;

    const size_bytes = Number(file_info.size_bytes || 0);
    if (!size_bytes && pending_record_count <= 1) return false;
    return size_bytes + pending_size_bytes > this.max_bytes_per_shard;
  }

  get_next_append_file_info(file_info = null) {
    const file_i = Number.isInteger(file_info?.file_i) ? file_info.file_i + 1 : 0;
    return this.get_ajson_file_info(file_i, 0, 0);
  }

  async get_current_append_file_info() {
    if (this._ajson_file_infos?.length) {
      return { ...this._ajson_file_infos[this._ajson_file_infos.length - 1] };
    }

    const infos = await this.list_ajson_data_files();
    if (!infos.length) {
      const info = this.get_ajson_file_info(0, 0, 0);
      this.upsert_ajson_file_info(info);
      return info;
    }
    return { ...infos[infos.length - 1] };
  }

  async append_lines_to_file_info(file_info, lines = [], appended_size_bytes = 0) {
    if (!lines.length) return 0;

    await this.ensure_ajson_file(file_info.file_i);
    await append_ajson_lines(this.fs, file_info.path, lines, {
      has_existing_content: file_info.size_bytes > 0,
    });

    file_info.size_bytes = (file_info.size_bytes || 0) + appended_size_bytes;
    file_info.record_count = (file_info.record_count || 0) + lines.length;
    this.upsert_ajson_file_info(file_info);
    return lines.length;
  }

  async process_load_queue() {
    this.collection.emit_event('collection:load_started');
    await this.ensure_data_dir();

    const block_collection = this.env.smart_blocks;
    await this.collection.embeddings?.load_vectors?.();
    await block_collection?.embeddings?.load_vectors?.();

    const prepare_context = build_load_prepare_context(this.collection, block_collection);

    let loaded = 0;
    let migrated_legacy_data = false;

    const data_files = await this.list_ajson_data_files();
    if (data_files.length) {
      loaded = await this.parse_ajson_files(data_files, prepare_context);
    } else if (await this.fs.exists(this.legacy_data_dir)) {
      loaded = await this.load_legacy_multi_files(prepare_context);
      migrated_legacy_data = true;
    }

    const should_rebuild_for_dims = refresh_prepare_context_file_info(
      prepare_context,
      this.collection,
      block_collection
    );

    const migrated_source_count = this.collection._has_legacy_embedding_data
      ? await this.collection.embeddings?.migrate_legacy_item_vectors?.() || 0
      : 0
    ;

    const migrated_block_count = block_collection?._has_legacy_embedding_data
      ? await block_collection?.embeddings?.migrate_legacy_item_vectors?.() || 0
      : 0
    ;

    if (migrated_legacy_data) {
      await this.commit_legacy_migration();
    }

    if (migrated_source_count || migrated_block_count || should_rebuild_for_dims) {
      await rebuild_loaded_embed_queue(this.collection, block_collection);
    } else {
      await prepare_loaded_items(this.collection.items, prepare_loaded_source, prepare_context.source_params);
      apply_prepared_embed_queue(this.collection, block_collection, prepare_context);
    }

    if (this.should_suggest_compaction(data_files)) {
      this.show_compact_notice_after_load();
    }

    this.collection.loaded = loaded;
    this.collection.emit_event('collection:load_completed', { loaded });
  }

  should_suggest_compaction(data_files = []) {
    if (!data_files.length) return false;

    const current_bytes = measure_ajson_files(data_files).bytes;
    let projected_compacted_bytes = 0;
    let shard_size_bytes = 0;
    let shard_record_count = 0;

    for (const source_key in this.collection.items || {}) {
      const source = this.collection.items[source_key];
      if (!source || source.deleted) continue;
      if (source.source_adapter?.should_persist === false) continue;

      const line_size_bytes = get_utf8_byte_length(this.get_source_ajson(source));
      const separator_size_bytes = shard_record_count ? 1 : 0;
      if (
        shard_record_count
        && shard_size_bytes + separator_size_bytes + line_size_bytes > this.max_bytes_per_shard
      ) {
        projected_compacted_bytes += shard_size_bytes;
        shard_size_bytes = 0;
        shard_record_count = 0;
      }

      shard_size_bytes += (shard_record_count ? 1 : 0) + line_size_bytes;
      shard_record_count += 1;
    }

    projected_compacted_bytes += shard_size_bytes;
    const reclaimable_bytes = current_bytes - projected_compacted_bytes;
    const min_reclaimable_bytes = this.max_bytes_per_shard / 2;

    return reclaimable_bytes >= min_reclaimable_bytes
      && reclaimable_bytes >= projected_compacted_bytes
    ;
  }

  show_compact_notice_after_load() {
    const wait_for_loaded = this.env?.constructor?.wait_for?.({ loaded: true });
    if (wait_for_loaded && typeof wait_for_loaded.then === 'function') {
      wait_for_loaded
        .then(() => this.show_compact_notice())
        .catch(() => this.show_compact_notice())
      ;
      return;
    }

    this.show_compact_notice();
  }

  show_compact_notice() {
    if (this._compact_notice_shown) return;
    if (typeof document === 'undefined') return;
    this._compact_notice_shown = true;

    const frag = document.createDocumentFragment();
    frag.createEl('p', {
      text: 'Smart Environment source data can be compacted to reduce AJSON log size and may improve future startup performance. Compaction only runs when you click the button.',
    });
    const compact_btn = frag.createEl('button', { text: 'Compact' });
    let notice = null;

    compact_btn.addEventListener('click', async () => {
      if (this.collection?._defer_embed_saves || this.env.smart_blocks?._defer_embed_saves) {
        new Notice('Smart Environment is still saving embeddings. Try Compact again when embedding is complete.');
        return;
      }

      compact_btn.disabled = true;
      compact_btn.textContent = 'Compacting...';

      try {
        await this.env.smart_blocks?.process_save_queue?.();
        await this.collection.process_save_queue?.();
        const result = await this.compact_shards();
        notice?.hide?.();
        new Notice(
          `Smart Environment source data compacted in ${result.duration_ms}ms: `
          + `${result.before.bytes} -> ${result.after.bytes} bytes, `
          + `${result.before.records} -> ${result.after.records} records, `
          + `${result.before.shards} -> ${result.after.shards} shards.`
        );
      } catch (error) {
        compact_btn.disabled = false;
        compact_btn.textContent = 'Compact';
        console.warn('[smart_env] Failed to compact source AJSON data', error);
        new Notice('Failed to compact Smart Environment source data. See console for details.');
      }
    });

    notice = new Notice(frag, 0);
  }

  async optimize_source_data(params = {}) {
    return await this.write_optimized_source_data_files(params);
  }

  async write_optimized_source_data_files(params = {}) {
    const block_collection = this.env.smart_blocks;
    const source_embeddings = this.collection.embeddings;
    const block_embeddings = block_collection?.embeddings;
    const replace_existing_backups = params.replace_existing_backups === true;

    if (this.collection?._defer_embed_saves || block_collection?._defer_embed_saves) {
      throw new Error('Cannot optimize source data while embedding saves are deferred.');
    }
    if (!source_embeddings || !block_embeddings) {
      throw new Error('Cannot optimize source data without source and block embeddings.');
    }

    if (!replace_existing_backups) {
      await assert_no_source_data_optimization_backups([
        source_embeddings,
        block_embeddings,
      ]);
    }

    const persistent_sources = Object.values(this.collection.items || {})
      .filter((source) => {
        return source
          && !source.deleted
          && source.source_adapter?.should_persist !== false
        ;
      })
    ;

    for (const source of persistent_sources) {
      source.ensure_block_embedding_selection?.();
      if (source.data.block_embedding_selection?.requires_reimport === true) {
        throw new Error(`Cannot optimize source data while ${source.key} requires re-import.`);
      }
      assert_optimization_embedding_data(source.data, source.key);
      for (const sub_key in source.data.blocks_data || {}) {
        assert_optimization_embedding_data(
          source.data.blocks_data[sub_key],
          `${source.key}${sub_key}`,
        );
      }
    }

    source_embeddings.clear_save_timeout();
    block_embeddings.clear_save_timeout();
    await source_embeddings.save_dirty_files();
    await block_embeddings.save_dirty_files();

    await block_collection?.process_save_queue?.();
    await this.collection.process_save_queue?.();

    await source_embeddings.load_vectors();
    await block_embeddings.load_vectors();

    const source_file_info = source_embeddings.get_active_file_info();
    const block_file_info = block_embeddings.get_active_file_info();
    const old_source_files = await this.list_ajson_data_files({ require_base: false });
    const vector_files = [
      get_optimization_vector_file(source_embeddings, source_file_info),
      get_optimization_vector_file(block_embeddings, block_file_info),
    ];

    // Recheck after queued saves before writing optimization files.
    if (!replace_existing_backups) {
      await assert_no_source_data_optimization_backups([
        source_embeddings,
        block_embeddings,
      ]);
    }

    const optimized_source_data = new Map();
    const source_retained_rows = new Map();
    const block_retained_rows = new Map();
    let unexpected_refs_removed = 0;

    for (const source of persistent_sources) {
      optimized_source_data.set(
        source.key,
        JSON.parse(JSON.stringify(source.data || {})),
      );

      const source_ref = get_current_optimization_ref(
        source,
        source_embeddings,
        source_file_info,
      );
      if (source.should_embed === true && source_ref) {
        source_retained_rows.set(source.key, source_ref.file_i);
      } else if (source.should_embed !== true && source_ref) {
        unexpected_refs_removed += 1;
      }

      for (const sub_key in source.data.blocks_data || {}) {
        const block_key = `${source.key}${sub_key}`;
        const block = block_collection.get?.(block_key);
        const should_embed = Boolean(
          block
          && !block.deleted
          && source.data.blocks_data[sub_key].should_embed === true
        );
        const block_ref = block
          ? get_current_optimization_ref(block, block_embeddings, block_file_info)
          : null
        ;

        if (should_embed && block_ref) {
          block_retained_rows.set(block_key, block_ref.file_i);
        } else if (!should_embed && block_ref) {
          unexpected_refs_removed += 1;
        }
      }
    }

    const source_vectors = build_optimized_vectors(
      source_embeddings,
      source_file_info,
      source_retained_rows.values(),
    );
    const block_vectors = build_optimized_vectors(
      block_embeddings,
      block_file_info,
      block_retained_rows.values(),
    );

    let removed_refs = 0;
    let removed_history_refs = 0;
    for (const source of persistent_sources) {
      const source_data = optimized_source_data.get(source.key);
      const source_old_file_i = source_retained_rows.get(source.key);
      const source_new_file_i = Number.isInteger(source_old_file_i)
        ? source_vectors.row_map.get(source_old_file_i)
        : null
      ;
      const source_rewrite = rewrite_optimized_embedding_data(
        source_data,
        source_file_info,
        source_new_file_i,
      );
      removed_refs += source_rewrite.removed_refs;
      removed_history_refs += source_rewrite.removed_history_refs;

      for (const sub_key in source_data.blocks_data || {}) {
        const block_key = `${source.key}${sub_key}`;
        const block_old_file_i = block_retained_rows.get(block_key);
        const block_new_file_i = Number.isInteger(block_old_file_i)
          ? block_vectors.row_map.get(block_old_file_i)
          : null
        ;
        const block_rewrite = rewrite_optimized_embedding_data(
          source_data.blocks_data[sub_key],
          block_file_info,
          block_new_file_i,
        );
        removed_refs += block_rewrite.removed_refs;
        removed_history_refs += block_rewrite.removed_history_refs;
      }
    }

    vector_files[0].vectors = source_vectors.vectors;
    vector_files[1].vectors = block_vectors.vectors;
    for (const vector_file of vector_files) {
      await vector_file.embeddings.ensure_data_dir();
      await vector_file.fs.write_binary(
        vector_file.temporary_path,
        vector_file.vectors.buffer,
      );
      vector_file.expected_bytes = vector_file.vectors.byteLength;
      const stat = await vector_file.fs.stat(vector_file.temporary_path);
      if (Number(stat.size || 0) !== vector_file.expected_bytes) {
        throw new Error(`Failed to validate optimized vector file ${vector_file.temporary_path}.`);
      }
      delete vector_file.vectors;
    }

    const new_source_files = [];
    let lines = [];
    let shard_size_bytes = 0;
    let file_i = 0;

    const flush_lines = async () => {
      if (!lines.length) return;

      const canonical_path = this.get_ajson_file_path(file_i);
      const temporary_path = `${canonical_path}.optimize.tmp`;
      const content = lines.join('\n');
      await this.fs.write(temporary_path, content);
      const stat = await this.fs.stat(temporary_path);
      if (Number(stat.size || 0) !== shard_size_bytes) {
        throw new Error(`Failed to validate optimized source data file ${temporary_path}.`);
      }
      new_source_files.push({
        fs: this.fs,
        canonical_path,
        temporary_path,
        expected_bytes: shard_size_bytes,
      });
      lines = [];
      shard_size_bytes = 0;
      file_i += 1;
      await yield_to_event_loop();
    };

    for (const source of persistent_sources) {
      const line = this.get_source_ajson({
        collection_key: this.collection.collection_key,
        key: source.key,
        data: optimized_source_data.get(source.key),
      });
      const line_size_bytes = get_utf8_byte_length(line);
      const separator_size_bytes = lines.length ? 1 : 0;
      if (
        lines.length
        && shard_size_bytes + separator_size_bytes + line_size_bytes > this.max_bytes_per_shard
      ) {
        await flush_lines();
      }

      shard_size_bytes += (lines.length ? 1 : 0) + line_size_bytes;
      lines.push(line);
    }

    await flush_lines();
    if (!new_source_files.length) {
      const canonical_path = this.get_ajson_file_path(0);
      const temporary_path = `${canonical_path}.optimize.tmp`;
      await this.fs.write(temporary_path, '');
      const stat = await this.fs.stat(temporary_path);
      if (Number(stat.size || 0) !== 0) {
        throw new Error(`Failed to validate optimized source data file ${temporary_path}.`);
      }
      new_source_files.push({
        fs: this.fs,
        canonical_path,
        temporary_path,
        expected_bytes: 0,
      });
    }

    return {
      vector_files,
      old_source_files: old_source_files.map((file) => ({
        fs: this.fs,
        canonical_path: file.path,
        backup_path: `${file.path}.backup`,
      })),
      new_source_files,
      replace_existing_backups,
      stats: {
        unexpected_refs_removed,
        removed_refs,
        removed_history_refs,
        retained_source_rows: source_vectors.row_map.size,
        retained_block_rows: block_vectors.row_map.size,
        source_vector_bytes: source_vectors.vectors.byteLength,
        block_vector_bytes: block_vectors.vectors.byteLength,
        source_shards: new_source_files.length,
      },
    };
  }

  async finish_source_data_optimization(plan) {
    const source_embeddings = this.collection.embeddings;
    const block_embeddings = this.env.smart_blocks?.embeddings;
    const replace_existing_backups = plan.replace_existing_backups === true;

    for (const file of [...plan.vector_files, ...plan.new_source_files]) {
      if (!(await file.fs.exists(file.temporary_path))) {
        throw new Error(
          `Source data optimization temporary file is missing: ${file.temporary_path}`
        );
      }

      const stat = await file.fs.stat(file.temporary_path);
      if (Number(stat.size || 0) !== file.expected_bytes) {
        throw new Error(
          `Failed to validate source data optimization temporary file ${file.temporary_path}.`
        );
      }
    }

    const prior_backup_files = replace_existing_backups
      ? await list_source_data_optimization_backup_files([
        source_embeddings,
        block_embeddings,
      ])
      : []
    ;
    if (!replace_existing_backups) {
      await assert_no_source_data_optimization_backups([
        source_embeddings,
        block_embeddings,
      ]);
    }

    await Promise.all([
      source_embeddings?.unload?.(),
      block_embeddings?.unload?.(),
    ]);

    for (const file of plan.vector_files) {
      if (await file.fs.exists(file.backup_path)) {
        if (!replace_existing_backups) {
          throw new Error(`Source data optimization backup already exists: ${file.backup_path}`);
        }
        await remove_file(file.fs, file.backup_path);
      }
      if (await file.fs.exists(file.canonical_path)) {
        await rename_file(file.fs, file.canonical_path, file.backup_path);
      }
      await rename_file(file.fs, file.temporary_path, file.canonical_path);
    }

    for (const file of plan.old_source_files) {
      if (await file.fs.exists(file.backup_path)) {
        if (!replace_existing_backups) {
          throw new Error(`Source data optimization backup already exists: ${file.backup_path}`);
        }
        await remove_file(file.fs, file.backup_path);
      }
      if (await file.fs.exists(file.canonical_path)) {
        await rename_file(file.fs, file.canonical_path, file.backup_path);
      }
    }

    for (const file of plan.new_source_files) {
      await rename_file(file.fs, file.temporary_path, file.canonical_path);
    }

    if (replace_existing_backups) {
      const current_backup_paths = [
        ...plan.vector_files.map((file) => file.backup_path),
        ...plan.old_source_files.map((file) => file.backup_path),
      ];
      for (const backup_file of prior_backup_files) {
        if (current_backup_paths.includes(backup_file.path)) continue;
        if (await backup_file.fs.exists(backup_file.path)) {
          await remove_file(backup_file.fs, backup_file.path);
        }
      }
    }

    globalThis.window.location.reload();
  }

  async process_save_queue() {
    if (this.collection?._defer_embed_saves) return;
    return await this.queue_ajson_write(() => this._process_save_queue());
  }

  async _process_save_queue() {
    if (this.collection?._defer_embed_saves) return;

    this.collection.emit_event('collection:save_started');

    const save_queue = Object.values(this.collection.items || {})
      .filter((source) => source._queue_save)
    ;

    if (!save_queue.length) {
      this.collection.emit_event('collection:save_completed', { saved: 0 });
      return;
    }

    save_queue.forEach((source) => {
      source._queue_save = false;
      clear_source_block_save_flags(source);
    });

    try {
      await this._append_sources(save_queue);
    } catch (error) {
      save_queue.forEach((source) => {
        source._queue_save = true;
        queue_source_block_save_flags(source);
      });
      throw error;
    }

    save_queue.forEach((source) => {
      if (source.deleted) delete_source_and_blocks(source);
    });

    this.collection.emit_event('collection:save_completed', { saved: save_queue.length });
  }

  async append_sources(sources = []) {
    if (!sources.length) return;

    return await this.queue_ajson_write(() => this._append_sources(sources));
  }

  async assert_ajson_base_ready(action = 'append') {
    if (await this.fs.exists(this.get_ajson_file_path(0))) return;
    if (await this.fs.exists(this.legacy_data_dir)) {
      throw new Error(`Cannot ${action} source AJSON before legacy migration is committed.`);
    }

    const uncommitted_files = await this.list_ajson_data_files({ require_base: false });
    if (!uncommitted_files.length) return;

    throw new Error(
      `Cannot ${action} source AJSON while numbered shards exist without shard 0. `
      + 'Run recover_uncommitted_shards() first.'
    );
  }

  async _append_sources(sources = []) {
    await this.assert_ajson_base_ready();
    await this.ensure_data_dir();

    let current_file_info = await this.get_current_append_file_info();
    let lines = [];
    let pending_size_bytes = 0;

    const flush_lines = async () => {
      if (!lines.length) return;
      await this.append_lines_to_file_info(current_file_info, lines, pending_size_bytes);
      lines = [];
      pending_size_bytes = 0;
      await yield_to_event_loop();
    };

    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      if (!source) continue;
      if (!source.deleted && source.source_adapter?.should_persist === false) {
        source._queue_save = false;
        continue;
      }

      const line = this.get_source_ajson(source);
      const line_size_bytes = get_utf8_byte_length(line);
      const separator_size_bytes = current_file_info.size_bytes || lines.length ? 1 : 0;
      const next_pending_size_bytes = pending_size_bytes + separator_size_bytes + line_size_bytes;

      if (this.should_rotate_append_file(
        current_file_info,
        next_pending_size_bytes,
        lines.length + 1,
      )) {
        await flush_lines();
        const next_append_size_bytes = (current_file_info.size_bytes ? 1 : 0) + line_size_bytes;
        if (this.should_rotate_append_file(current_file_info, next_append_size_bytes, 1)) {
          current_file_info = this.get_next_append_file_info(current_file_info);
        }
      }

      pending_size_bytes += (current_file_info.size_bytes || lines.length ? 1 : 0)
        + line_size_bytes
      ;
      lines.push(line);
      if (lines.length >= AJSON_LINE_CHUNK_SIZE) {
        await flush_lines();
      }
    }

    await flush_lines();
  }

  async compact_shards() {
    return await this.queue_ajson_write(() => this._compact_shards());
  }

  async recover_uncommitted_shards() {
    return await this.queue_ajson_write(async () => {
      if (await this.fs.exists(this.get_ajson_file_path(0))) {
        throw new Error('Cannot recover uncommitted source AJSON after shard 0 is committed.');
      }
      if (await this.fs.exists(this.legacy_data_dir)) {
        throw new Error('Cannot recover uncommitted source AJSON while legacy migration is pending.');
      }

      const uncommitted_files = await this.list_ajson_data_files({ require_base: false });
      if (!uncommitted_files.length) {
        throw new Error('Cannot recover uncommitted source AJSON because no numbered shards were found.');
      }

      return await this._compact_shards({
        commit_base_last: true,
        include_uncommitted_files: true,
      });
    });
  }

  async commit_legacy_migration() {
    const queued_sources = Object.values(this.collection.items || {})
      .filter((source) => source?._queue_save)
    ;
    const queued_blocks = Object.values(this.env.smart_blocks?.items || {})
      .filter((block) => block?._queue_save)
    ;

    queued_sources.forEach((source) => {
      source._queue_save = false;
    });
    queued_blocks.forEach((block) => {
      block._queue_save = false;
    });

    try {
      await this.queue_ajson_write(() => this._compact_shards({
        commit_base_last: true,
        include_uncommitted_files: true,
      }));
    } catch (error) {
      queued_sources.forEach((source) => {
        source._queue_save = true;
      });
      queued_blocks.forEach((block) => {
        block._queue_save = true;
      });
      throw error;
    }
  }

  async _compact_shards(params = {}) {
    if (this.collection?._defer_embed_saves || this.env.smart_blocks?._defer_embed_saves) {
      throw new Error('Cannot compact AJSON data while embedding saves are deferred.');
    }
    if (params.include_uncommitted_files !== true) {
      await this.assert_ajson_base_ready('compact');
    }

    const started_at = Date.now();
    const commit_base_last = params.commit_base_last === true;
    await this.ensure_data_dir();

    const old_files = await this.list_ajson_data_files({
      require_base: params.include_uncommitted_files !== true,
    });
    const before = measure_ajson_files(old_files);
    const final_infos = [];
    const temp_paths = [];
    let after_bytes = 0;
    let lines = [];
    let shard_size_bytes = 0;
    let file_i = 0;

    const flush_lines = async () => {
      if (!lines.length) return;

      const path = this.get_ajson_file_path(file_i);
      const temp_path = `${path}.tmp`;
      const content = lines.join('\n');
      await this.fs.write(temp_path, content);
      after_bytes += shard_size_bytes;
      temp_paths.push({ temp_path, path });
      final_infos.push(this.get_ajson_file_info(file_i, shard_size_bytes, lines.length));
      lines = [];
      shard_size_bytes = 0;
      file_i += 1;
      await yield_to_event_loop();
    };

    for (const source_key in this.collection.items || {}) {
      const source = this.collection.items[source_key];
      if (!source || source.deleted) continue;
      if (source.source_adapter?.should_persist === false) continue;

      const line = this.get_source_ajson(source);
      const line_size_bytes = get_utf8_byte_length(line);
      const separator_size_bytes = lines.length ? 1 : 0;
      if (
        lines.length
        && shard_size_bytes + separator_size_bytes + line_size_bytes > this.max_bytes_per_shard
      ) {
        await flush_lines();
      }

      shard_size_bytes += (lines.length ? 1 : 0) + line_size_bytes;
      lines.push(line);
    }

    await flush_lines();

    if (!final_infos.length) {
      const path = this.get_ajson_file_path(0);
      const temp_path = `${path}.tmp`;
      await this.fs.write(temp_path, '');
      temp_paths.push({ temp_path, path });
      final_infos.push(this.get_ajson_file_info(0, 0, 0));
    }

    const final_paths = new Set(final_infos.map((info) => info.path));
    const base_path = this.get_ajson_file_path(0);

    if (commit_base_last) {
      for (const { temp_path, path } of temp_paths) {
        if (path === base_path) continue;
        await replace_file_with_temp(this.fs, temp_path, path);
      }
      for (const old_file of old_files) {
        if (old_file.path === base_path || final_paths.has(old_file.path)) continue;
        if (!(await this.fs.exists(old_file.path))) continue;
        await remove_file(this.fs, old_file.path);
        if (await this.fs.exists(old_file.path)) {
          throw new Error(`Failed to remove obsolete AJSON shard ${old_file.path}`);
        }
      }
      const base_temp = temp_paths.find(({ path }) => path === base_path);
      await replace_file_with_temp(this.fs, base_temp.temp_path, base_temp.path);
    } else {
      for (const { temp_path, path } of temp_paths) {
        await replace_file_with_temp(this.fs, temp_path, path);
      }
      for (const old_file of old_files) {
        if (final_paths.has(old_file.path)) continue;
        if (!(await this.fs.exists(old_file.path))) continue;
        await remove_file(this.fs, old_file.path);
        if (await this.fs.exists(old_file.path)) {
          throw new Error(`Failed to remove obsolete AJSON shard ${old_file.path}`);
        }
      }
    }

    this._ajson_file_infos = final_infos;
    this._needs_minimal_rewrite = false;
    this._has_stale_source_records = false;

    return {
      before,
      after: {
        bytes: after_bytes,
        records: final_infos.reduce((total, info) => total + info.record_count, 0),
        shards: final_infos.length,
      },
      duration_ms: Date.now() - started_at,
    };
  }

  queue_ajson_write(write) {
    const next_write = Promise.resolve(this._ajson_write_promise)
      .catch(() => {})
      .then(write)
    ;
    this._ajson_write_promise = next_write;
    return next_write;
  }

  get_source_ajson(source) {
    const data_value = source.deleted
      ? 'null'
      : JSON.stringify(source.data || {})
    ;
    return `${JSON.stringify(`${source.collection_key}:${source.key}`)}: ${data_value},`;
  }

  async parse_ajson(raw_data = '', prepare_context = null, params = {}) {
    const state = this.create_ajson_parse_state(prepare_context, params);
    this.reset_ajson_parse_flags();
    this._needs_minimal_rewrite = false;

    await this.parse_ajson_raw_into_state(raw_data, state);
    return await this.materialize_ajson_parse_state(state, prepare_context);
  }

  async parse_ajson_files(data_files = [], prepare_context = null) {
    const state = this.create_ajson_parse_state(prepare_context);
    this.reset_ajson_parse_flags();
    this._needs_minimal_rewrite = false;

    const sorted_data_files = data_files.slice()
      .sort((left, right) => left.file_i - right.file_i)
    ;

    for (const file_info of sorted_data_files) {
      const raw_data = require_ajson_text(
        await this.fs.read(file_info.path, 'utf-8', { no_cache: true }),
        file_info.path,
      );
      file_info.record_count = raw_data.length
        ? await this.parse_ajson_raw_into_state(raw_data, state)
        : 0
      ;
      this.upsert_ajson_file_info(file_info);

      await yield_to_event_loop();
    }

    return await this.materialize_ajson_parse_state(state, prepare_context);
  }

  create_ajson_parse_state(prepare_context = null, params = {}) {
    return {
      source_values: {},
      legacy_block_values_by_source: {},
      active_source_keys: prepare_context?.active_source_keys || null,
      legacy_mode: params.legacy_mode === true,
      tombstoned_source_keys: new Set(),
      skipped_source_count: 0,
    };
  }

  reset_ajson_parse_flags() {
    this.collection._has_legacy_embedding_data = false;
    if (this.env.smart_blocks) this.env.smart_blocks._has_legacy_embedding_data = false;
  }

  async parse_ajson_raw_into_state(raw_data = '', state = this.create_ajson_parse_state()) {
    const parse_records = state.legacy_mode
      ? parse_legacy_ajson_records
      : parse_ajson_records
    ;
    return await parse_records(raw_data, (full_key, value) => {
      const { collection_key, item_key, changed } = parse_ajson_key(full_key);

      if (collection_key === this.collection.collection_key) {
        if (!should_load_source_key(state, item_key)) {
          if (value) {
            state.skipped_source_count += 1;
            this._has_stale_source_records = true;
          }
          return;
        }

        if (changed) this._needs_minimal_rewrite = true;

        if (has_legacy_embedding_data(value)) {
          this.collection._has_legacy_embedding_data = true;
        }

        if (!value) {
          delete state.source_values[item_key];
          delete state.legacy_block_values_by_source[item_key];
          state.tombstoned_source_keys.add(item_key);
          this._has_stale_source_records = true;
          return;
        }

        state.tombstoned_source_keys.delete(item_key);
        state.source_values[item_key] = value;
        return;
      }

      if (collection_key !== 'smart_blocks') return;
      if (!state.legacy_mode) {
        this._needs_minimal_rewrite = true;
        return;
      }
      const source_key = get_source_key_from_block_key(item_key);
      if (!source_key || !should_load_source_key(state, source_key) || state.tombstoned_source_keys.has(source_key)) {
        if (value) {
          state.skipped_source_count += 1;
          this._has_stale_source_records = true;
        }
        return;
      }

      if (changed) this._needs_minimal_rewrite = true;

      if (has_legacy_embedding_data(value) && this.env.smart_blocks) {
        this.env.smart_blocks._has_legacy_embedding_data = true;
      }

      if (!state.legacy_block_values_by_source[source_key]) state.legacy_block_values_by_source[source_key] = {};
      state.legacy_block_values_by_source[source_key][item_key] = value;
      this._needs_minimal_rewrite = true;
    });
  }

  async materialize_ajson_parse_state(state = this.create_ajson_parse_state(), prepare_context = null) {
    const source_values = state.source_values || {};
    const legacy_block_values_by_source = state.legacy_block_values_by_source || {};

    let loaded = 0;
    let processed = 0;
    for (const source_key in source_values) {
      const source_data = source_values[source_key];
      if (!source_data) {
        this.delete_source_entry(source_key);
      } else {
        const source = await this.load_source_entry(
          source_key,
          source_data,
          legacy_block_values_by_source[source_key],
          prepare_context,
          { legacy_mode: state.legacy_mode }
        );
        if (source) loaded += 1;
      }

      processed += 1;
      if (processed % MATERIALIZE_YIELD_EVERY === 0) await yield_to_event_loop();
    }

    return loaded;
  }

  async load_source_entry(source_key, raw_data = {}, legacy_block_values = {}, prepare_context = null, params = {}) {
    let source = this.collection.get(source_key);
    if (!source) return null;

    const previous_block_sub_keys = new Set(Object.keys(source?.data?.blocks_data || {}));

    if (!params.legacy_mode && raw_data.blocks) {
      this._needs_minimal_rewrite = true;
    }
    if (has_legacy_embedding_data(raw_data)) this.collection._has_legacy_embedding_data = true;

    const source_data = params.legacy_mode
      ? migrate_legacy_source_data(source_key, raw_data, legacy_block_values)
      : normalize_sharded_source_data(source_key, raw_data)
    ;
    source_data.class_name = source_data.class_name || this.collection.item_class_name;

    source.data = source_data;

    if (prepare_context) {
      prepare_loaded_source(source, prepare_context.source_params);
    } else {
      source._queue_load = false;
      source.loaded_at = Date.now();
    }

    await this.load_source_blocks(source, previous_block_sub_keys, prepare_context);
    return source;
  }

  async load_source_blocks(source, previous_block_sub_keys = null, prepare_context = null) {
    const block_collection = this.env.smart_blocks;
    if (!block_collection) return;

    const blocks_data = source.data.blocks_data || {};
    const current_block_sub_keys = new Set();
    const loaded_blocks = [];
    let processed = 0;

    for (const block_ref of Object.keys(blocks_data)) {
      const sub_key = get_sub_key_from_block_ref(source.key, block_ref);
      const block_data = blocks_data[block_ref];
      if (!sub_key || !block_data) {
        delete blocks_data[block_ref];
        this._needs_minimal_rewrite = true;
        continue;
      }

      if (has_legacy_embedding_data(block_data) && this.env.smart_blocks) {
        this.env.smart_blocks._has_legacy_embedding_data = true;
      }
      if (
        Array.isArray(block_data)
        || Object.prototype.hasOwnProperty.call(block_data, 'path')
        || Object.prototype.hasOwnProperty.call(block_data, 'class_name')
      ) {
        this._needs_minimal_rewrite = true;
      }

      if (
        block_ref !== sub_key
        && Object.prototype.hasOwnProperty.call(blocks_data, sub_key)
      ) {
        delete blocks_data[block_ref];
        this._needs_minimal_rewrite = true;
        continue;
      }

      current_block_sub_keys.add(sub_key);
      const next_data = ensure_loaded_block_data(source.key, sub_key, block_data);
      if (block_ref !== sub_key) {
        delete blocks_data[block_ref];
        this._needs_minimal_rewrite = true;
      }
      source.data.blocks_data[sub_key] = next_data;

      let block = block_collection.get(next_data.key);
      if (!block) {
        block = new block_collection.item_type(this.env);
        set_loaded_block_refs(block, source, sub_key, next_data);
        block_collection.set(block);
      } else {
        set_loaded_block_refs(block, source, sub_key, next_data);
      }

      loaded_blocks.push(block);

      processed += 1;
      if (processed % MATERIALIZE_YIELD_EVERY === 0) await yield_to_event_loop();
    }

    for (let i = 0; i < loaded_blocks.length; i += 1) {
      if (prepare_context) {
        prepare_loaded_block(loaded_blocks[i], prepare_context.block_params);
      } else {
        loaded_blocks[i]._queue_load = false;
        loaded_blocks[i].loaded_at = Date.now();
      }
    }

    if (!previous_block_sub_keys) return;

    processed = 0;
    previous_block_sub_keys.forEach((sub_key) => {
      if (current_block_sub_keys.has(sub_key)) return;
      delete block_collection.items[`${source.key}${sub_key}`];
      processed += 1;
    });

    if (processed) await yield_to_event_loop();
  }

  delete_source_entry(source_key) {
    delete_source_and_blocks(this.collection.get(source_key));
  }

  async list_legacy_files() {
    const paths = [];
    Object.keys(this.collection.items || {}).forEach((key) => {
      const source_key = key.split('#')[0];
      // V2 excluded these paths before deriving per-source data filenames, so
      // there is no legacy file to probe during the one-time migration.
      if (source_key.length > 200) return;
      paths.push(
        'multi' + this.fs.sep + source_key.replace(/[\s\/.]/g, '_').replace('.md', '') + '.ajson'
      );
    });
    return [...new Set(paths)];
  }

  async load_legacy_multi_files(prepare_context = null) {
    const files = await this.list_legacy_files();
    let loaded = 0;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const path = typeof file === 'string' ? file : file?.path;
      if (!path || !path.endsWith('.ajson')) continue;
      const read_result = await this.fs.read(path, 'utf-8');
      if (read_result === null) continue;
      const raw_data = require_ajson_text(read_result, path);
      if (!raw_data.length) continue;

      const had_source_legacy_embedding_data = this.collection._has_legacy_embedding_data === true;
      const had_block_legacy_embedding_data = this.env.smart_blocks?._has_legacy_embedding_data === true;

      try {
        loaded += await this.parse_ajson(raw_data, prepare_context, { legacy_mode: true });
      } catch (error) {
        this.collection._has_legacy_embedding_data = had_source_legacy_embedding_data;
        if (this.env.smart_blocks) {
          this.env.smart_blocks._has_legacy_embedding_data = had_block_legacy_embedding_data;
        }
        const parse_error = new Error(`Failed to parse legacy AJSON file ${path}: ${error.message}`);
        parse_error.cause = error;
        throw parse_error;
      }

      this.collection._has_legacy_embedding_data = Boolean(
        this.collection._has_legacy_embedding_data
        || had_source_legacy_embedding_data
      );
      if (this.env.smart_blocks) {
        this.env.smart_blocks._has_legacy_embedding_data = Boolean(
          this.env.smart_blocks._has_legacy_embedding_data
          || had_block_legacy_embedding_data
        );
      }

      if (i > 0 && i % LEGACY_LOAD_YIELD_EVERY === 0) await yield_to_event_loop();
    }

    return loaded;
  }
}

function parse_ajson_key(full_key = '') {
  let [collection_key, ...item_key_parts] = String(full_key).split(':');
  let changed = false;
  if (class_to_collection_key[collection_key]) {
    collection_key = class_to_collection_key[collection_key];
    changed = true;
  }
  return {
    collection_key,
    item_key: item_key_parts.join(':'),
    changed,
  };
}

function parse_legacy_ajson_records(raw_data = '', on_record) {
  const property_stream = String(raw_data || '').trim().replace(/,\s*$/, '');
  if (!property_stream) return 0;

  const records = JSON.parse(`{${property_stream}}`);
  const entries = Object.entries(records);
  for (const [full_key, value] of entries) {
    on_record(full_key, value);
  }
  return entries.length;
}

async function parse_ajson_records(raw_data = '', on_record) {
  const text = String(raw_data || '');
  let cursor = 0;
  let lines = [];
  let record_count = 0;

  while (cursor <= text.length) {
    const next_newline = text.indexOf('\n', cursor);
    const end = next_newline === -1 ? text.length : next_newline;
    const line = text.slice(cursor, end).trim();

    if (line) {
      lines.push(line);
      record_count += 1;
    }

    if (lines.length >= AJSON_LINE_CHUNK_SIZE) {
      for (let i = 0; i < lines.length; i += 1) parse_ajson_line(lines[i], on_record);
      lines = [];
      await yield_to_event_loop();
    }

    if (next_newline === -1) break;
    cursor = next_newline + 1;
  }

  if (lines.length) {
    for (let i = 0; i < lines.length; i += 1) parse_ajson_line(lines[i], on_record);
  }

  return record_count;
}

function parse_ajson_line(line = '', on_record) {
  const trimmed = String(line || '').trim();
  const json_line = trimmed.replace(/,\s*$/, '');
  if (!json_line) return;

  try {
    const parsed = parse_ajson_key_value(json_line);
    if (!parsed) return;
    on_record(parsed.key, parsed.value);
  } catch (error) {
    console.warn('AjsonShardedSourcesDataAdapter: skipped invalid AJSON line', error);
  }
}

function parse_ajson_key_value(json_line = '') {
  if (!json_line.startsWith('"')) {
    const parsed = JSON.parse(`{${json_line}}`);
    const key = Object.keys(parsed)[0];
    return { key, value: parsed[key] };
  }

  let key_end = -1;
  for (let i = 1; i < json_line.length; i += 1) {
    if (json_line[i] !== '"') continue;
    let escape_count = 0;
    for (let j = i - 1; j >= 0 && json_line[j] === '\\'; j -= 1) escape_count += 1;
    if (escape_count % 2 === 0) {
      key_end = i + 1;
      break;
    }
  }

  if (key_end === -1) return null;

  const colon_i = json_line.indexOf(':', key_end);
  if (colon_i === -1) return null;

  return {
    key: JSON.parse(json_line.slice(0, key_end)),
    value: JSON.parse(json_line.slice(colon_i + 1).trim()),
  };
}

function should_load_source_key(state, source_key = '') {
  if (!state?.active_source_keys) return true;
  return state.active_source_keys.has(source_key);
}

function normalize_sharded_source_data(source_key, raw_data = {}) {
  const source_data = raw_data || {};
  delete source_data.blocks;
  source_data.key = source_key;
  source_data.path = source_key;
  return source_data;
}

function migrate_legacy_source_data(source_key, raw_data = {}, legacy_block_values = {}) {
  const source_data = raw_data || {};
  const blocks_initialized = Boolean(source_data.blocks);
  const legacy_blocks = source_data.blocks || {};
  const source_blocks_data = source_data.blocks_data || {};
  const blocks_data = {};

  for (const block_ref in legacy_blocks) {
    const sub_key = get_sub_key_from_block_ref(source_key, block_ref);
    if (!sub_key) continue;

    const block_key = `${source_key}${sub_key}`;
    const block_data = {
      ...(source_blocks_data[sub_key] || source_blocks_data[block_key] || {}),
      ...(legacy_block_values[block_key] || legacy_block_values[sub_key] || {}),
      key: block_key,
      lines: legacy_blocks[block_ref],
    };
    delete block_data.path;
    delete block_data.class_name;
    blocks_data[sub_key] = block_data;
  }

  delete source_data.blocks;
  if (blocks_initialized) {
    source_data.blocks_data = blocks_data;
  } else {
    delete source_data.blocks_data;
  }
  source_data.key = source_key;
  source_data.path = source_key;
  return source_data;
}

function ensure_loaded_block_data(source_key, sub_key, block_data) {
  const block_key = `${source_key}${sub_key}`;
  if (Array.isArray(block_data)) block_data = { lines: block_data };
  block_data.key = block_key;
  delete block_data.path;
  delete block_data.class_name;
  return block_data;
}

function set_loaded_block_refs(block, source, sub_key, data) {
  block._block_key = data.key || `${source.key}${sub_key}`;
  block._source_key = source.key;
  block._sub_key = sub_key;
  block._source = source;
  block._pending_data = null;
  block._data_ref = data;
  block._data_source = source;
  block._data_sub_key = sub_key;
  block._data_source_data = source.data;
  block.deleted = false;
}

function has_legacy_embedding_data(data = {}) {
  return Boolean(
    data?.embeddings
    || data?.last_embed
    || has_legacy_embedding_refs(data)
  );
}

function build_load_prepare_context(source_collection, block_collection, loaded_at = Date.now()) {
  return {
    active_source_keys: new Set(Object.keys(source_collection.items || {})),
    source_params: {
      loaded_at,
      embeddings: source_collection.embeddings,
      file_info: source_collection.embeddings?.get_active_file_info?.(),
      embed_queue: [],
      prepared_keys: new Set(),
    },
    block_params: {
      loaded_at,
      embeddings: block_collection?.embeddings,
      file_info: block_collection?.embeddings?.get_active_file_info?.(),
      embed_queue: [],
      prepared_keys: new Set(),
      min_chars: block_collection?.settings?.min_chars,
    },
  };
}

function refresh_prepare_context_file_info(prepare_context, source_collection, block_collection) {
  const had_source_dims = Boolean(prepare_context.source_params.file_info?.dims);
  const had_block_dims = Boolean(prepare_context.block_params.file_info?.dims);

  prepare_context.source_params.file_info = refresh_embedding_file_info(source_collection.embeddings);
  prepare_context.block_params.file_info = refresh_embedding_file_info(block_collection?.embeddings);

  return (!had_source_dims && Boolean(prepare_context.source_params.file_info?.dims))
    || (!had_block_dims && Boolean(prepare_context.block_params.file_info?.dims))
  ;
}

function refresh_embedding_file_info(embeddings) {
  if (!embeddings) return null;
  const file = embeddings.active_file;
  const value_count = embeddings.get_vector_value_count(file);
  if (value_count) {
    embeddings._dims_by_file[file] = embeddings.resolve_file_dims(file, value_count);
  }
  return embeddings.get_active_file_info();
}

async function rebuild_loaded_embed_queue(source_collection, block_collection, loaded_at = Date.now()) {
  const prepare_context = build_load_prepare_context(source_collection, block_collection, loaded_at);
  await prepare_loaded_items(source_collection.items, prepare_loaded_source, prepare_context.source_params);
  await prepare_loaded_items(block_collection?.items, prepare_loaded_block, prepare_context.block_params);
  apply_prepared_embed_queue(source_collection, block_collection, prepare_context);
}

function apply_prepared_embed_queue(source_collection, block_collection, prepare_context) {
  const source_embed_queue = prepare_context.source_params.embed_queue;
  const block_embed_queue = prepare_context.block_params.embed_queue;
  source_collection._embed_queue = source_embed_queue.concat(block_embed_queue);
  source_collection._embed_queue_ready = true;
  if (block_collection) {
    block_collection._embed_queue = block_embed_queue;
    block_collection._embed_queue_ready = true;
  }
}

async function prepare_loaded_items(items = {}, prepare_fn, params = {}) {
  let processed = 0;

  for (const key in items || {}) {
    if (params.prepared_keys?.has(key)) continue;
    prepare_fn(items[key], params);
    processed += 1;
    if (processed % MATERIALIZE_YIELD_EVERY === 0) await yield_to_event_loop();
  }
}

function mark_item_prepared(item, params = {}) {
  if (!item?.key || !params.prepared_keys) return false;
  if (params.prepared_keys.has(item.key)) return true;
  params.prepared_keys.add(item.key);
  return false;
}

function prepare_loaded_source(source, params = {}) {
  if (mark_item_prepared(source, params)) return;
  source._queue_load = false;
  source.loaded_at = params.loaded_at || Date.now();
  const has_current_vector = params.embeddings?.has_current_vector_ref?.(source, undefined, params.file_info) === true;
  if (has_current_vector) source._queue_embed = false;
  source._queue_import = should_queue_import(source);
  if (source._queue_embed || (!has_current_vector && source.should_embed)) {
    params.embed_queue?.push(source);
  }
}

function prepare_loaded_block(block, params = {}) {
  if (mark_item_prepared(block, params)) return;
  block._queue_load = false;
  block.loaded_at = params.loaded_at || Date.now();
  const has_current_vector = params.embeddings?.has_current_vector_ref?.(block, undefined, params.file_info) === true;
  if (has_current_vector) block._queue_embed = false;
  const should_embed = typeof block.get_should_embed === 'function'
    ? block.get_should_embed({ min_chars: params.min_chars })
    : block.should_embed
  ;
  if (!should_embed) {
    block._queue_embed = false;
    return;
  }
  if (block._queue_embed || !has_current_vector) {
    params.embed_queue?.push(block);
  }
}

function should_queue_import(source) {
  if (!source || source.deleted) return false;
  if (!source.blocks_initialized) return true;
  if (!source.file) return false;

  try {
    return Boolean(source.source_adapter?.outdated);
  } catch (error) {
    console.warn(`AjsonShardedSourcesDataAdapter: failed import check for ${source.key}`, error);
    return true;
  }
}

function clear_source_block_save_flags(source) {
  const block_collection = source?.env?.smart_blocks;
  if (!source?.key || !block_collection?.items) return;

  for (const sub_key in source.data.blocks_data || {}) {
    const block = block_collection.get(`${source.key}${sub_key}`);
    if (block) block._queue_save = false;
  }
}

function queue_source_block_save_flags(source) {
  const block_collection = source?.env?.smart_blocks;
  if (!source?.key || !block_collection?.items) return;

  for (const sub_key in source.data.blocks_data || {}) {
    const block = block_collection.get(`${source.key}${sub_key}`);
    if (block) block._queue_save = true;
  }
}

function delete_source_and_blocks(source) {
  if (!source?.key) return;

  const block_collection = source.env?.smart_blocks;
  const known_block_sub_keys = Object.keys(source.data?.blocks_data || {});

  if (known_block_sub_keys.length) {
    known_block_sub_keys.forEach((sub_key) => {
      delete block_collection?.items?.[`${source.key}${sub_key}`];
    });
  } else {
    Object.keys(block_collection?.items || {}).forEach((block_key) => {
      if (get_source_key_from_block_key(block_key) === source.key) {
        delete block_collection.items[block_key];
      }
    });
  }

  delete source.collection.items[source.key];
}

function get_source_key_from_block_key(block_key = '') {
  return String(block_key).split('#')[0];
}

function get_sub_key_from_block_ref(source_key, block_ref = '') {
  const value = String(block_ref || '');
  if (value.startsWith('#')) return value;
  if (value.startsWith(source_key)) {
    const sub_key = value.slice(source_key.length);
    if (sub_key.startsWith('#')) return sub_key;
  }
  const parts = value.split('#');
  if (parts.length < 2) return '';
  return `#${parts.slice(1).join('#')}`;
}

function assert_optimization_embedding_data(data = {}, item_key = '') {
  if (data.embeddings || data.last_embed || has_legacy_embedding_refs(data)) {
    throw new Error(`Cannot optimize source data with legacy embedding refs: ${item_key}`);
  }
}

function get_current_optimization_ref(item, embeddings, file_info) {
  const ref = item.data?.embedding?.default?.[file_info.model_fingerprint];
  if (!ref) return null;
  if (!embeddings.has_current_vector_ref(item, undefined, file_info)) return null;
  return ref;
}

function build_optimized_vectors(embeddings, file_info, retained_file_is) {
  const old_file_is = Array.from(new Set(retained_file_is))
    .sort((left, right) => left - right)
  ;
  const dims = Number(file_info.dims || 0);
  if (old_file_is.length && !dims) {
    throw new Error(`Cannot optimize vector file ${file_info.file} without dimensions.`);
  }

  const vectors = new Float32Array(old_file_is.length * dims);
  const row_map = new Map();
  old_file_is.forEach((old_file_i, new_file_i) => {
    const vec = embeddings.get_vector(file_info.file, old_file_i);
    if (!vec || vec.length !== dims) {
      throw new Error(`Cannot read vector row ${old_file_i} from ${file_info.file}.`);
    }
    vectors.set(vec, new_file_i * dims);
    row_map.set(old_file_i, new_file_i);
  });

  return { vectors, row_map };
}

function rewrite_optimized_embedding_data(data = {}, file_info, next_file_i = null) {
  const embedding = data.embedding;
  if (!embedding) return { removed_refs: 0, removed_history_refs: 0 };

  const refs = embedding.default;
  if (refs?.file) {
    throw new Error('Cannot optimize source data with legacy embedding refs.');
  }

  let removed_refs = 0;
  if (refs) {
    for (const model_fingerprint in refs) {
      const ref = refs[model_fingerprint];
      if (ref?.file !== file_info.file) continue;

      if (
        model_fingerprint === file_info.model_fingerprint
        && Number.isInteger(next_file_i)
      ) {
        ref.file_i = next_file_i;
        continue;
      }

      delete refs[model_fingerprint];
      removed_refs += 1;
    }
    if (!Object.keys(refs).length) delete embedding.default;
  }

  const history = Array.isArray(embedding.history) ? embedding.history : [];
  const next_history = history.filter((ref) => ref?.file !== file_info.file);
  const removed_history_refs = history.length - next_history.length;
  if (Array.isArray(embedding.history)) embedding.history = next_history;

  return { removed_refs, removed_history_refs };
}

function get_optimization_vector_file(embeddings, file_info) {
  const canonical_path = embeddings.get_file_path(file_info.file);
  return {
    embeddings,
    fs: embeddings.data_fs,
    canonical_path,
    temporary_path: `${canonical_path}.optimize.tmp`,
    backup_path: `${canonical_path}.backup`,
    expected_bytes: 0,
  };
}

function require_ajson_text(raw_data, path) {
  if (typeof raw_data === 'string') return raw_data;
  const detail = raw_data?.error ? `: ${raw_data.error}` : '';
  throw new Error(`Failed to read AJSON file ${path}${detail}`);
}

function measure_ajson_files(file_infos = []) {
  let bytes = 0;
  let records = 0;

  for (const file_info of file_infos) {
    bytes += Number(file_info.size_bytes || 0);
    records += Number(file_info.record_count || 0);
  }

  return {
    bytes,
    records,
    shards: file_infos.length,
  };
}

function get_utf8_byte_length(value = '') {
  return utf8_encoder.encode(value).byteLength;
}

async function append_ajson_lines(fs, path, lines = [], params = {}) {
  if (!lines.length) return;
  const prefix = params.has_existing_content ? '\n' : '';
  const content = `${prefix}${lines.join('\n')}`;
  if (typeof fs.adapter?.append === 'function') {
    return await fs.adapter.append(path, content);
  }
  return await fs.append(path, content);
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

async function assert_no_source_data_optimization_backups(embeddings_list = []) {
  const backup_files = await list_source_data_optimization_backup_files(embeddings_list);
  if (backup_files.length) {
    throw new Error(`Source data optimization backup already exists: ${backup_files[0].path}`);
  }
}

async function list_source_data_optimization_backup_files(embeddings_list = []) {
  const backup_files = [];

  for (const embeddings of embeddings_list) {
    const fs = embeddings.data_fs;
    const data_dir = embeddings.data_dir;
    if (!(await fs.exists(data_dir))) continue;

    const files = await fs.list(data_dir);
    for (const file of files || []) {
      const file_path = file?.path || file?.name || file || '';
      if (!get_path_basename(file_path).endsWith('.backup')) continue;

      const backup_path = file_path.includes('/') || file_path.includes('\\')
        ? file_path
        : `${data_dir}/${file_path}`
      ;
      backup_files.push({ fs, path: backup_path });
    }
  }

  return backup_files;
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

function get_path_basename(file_path = '') {
  const normalized_path = String(file_path || '').replace(/\\/g, '/');
  return normalized_path.split('/').pop() || '';
}

function yield_to_event_loop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export default {
  collection: AjsonShardedSourcesDataAdapter,
};
