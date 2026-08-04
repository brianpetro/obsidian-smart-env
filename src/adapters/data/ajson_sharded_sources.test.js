import test from 'ava';
import { Platform } from 'obsidian';
import { AjsonShardedSourcesDataAdapter } from './ajson_sharded_sources.js';

const DEFAULT_MAX_BYTES_PER_SHARD = Platform.isMobile
  ? 8 * 1024 * 1024
  : 64 * 1024 * 1024
;
const TEST_MAX_BYTES_PER_SHARD = 1024;

function get_utf8_byte_length(value = '') {
  return new TextEncoder().encode(value).byteLength;
}

function create_embeddings() {
  return {
    active_file: 'mf_test',
    _dims_by_file: {},
    async load_vectors() {},
    async migrate_legacy_item_vectors() { return 0; },
    get_active_file_info() {
      return {
        file: this.active_file,
        dims: 2,
        value_count: 0,
      };
    },
    get_vector_value_count() { return 0; },
    resolve_file_dims() { return 2; },
    has_current_vector_ref() { return false; },
  };
}

function create_optimization_embeddings(fs, data_dir, values = [], dims = 2) {
  const active_file = 'mf_test';
  const vectors = values instanceof Float32Array
    ? values
    : new Float32Array(values)
  ;

  return {
    active_file,
    model_fingerprint: active_file,
    data_dir,
    data_fs: fs,
    unloaded: false,
    clear_save_timeout() {},
    async save_dirty_files() {},
    async load_vectors() { return vectors; },
    async ensure_data_dir() {
      if (!(await fs.exists(data_dir))) await fs.mkdir(data_dir);
    },
    async unload() { this.unloaded = true; },
    get_active_file_info() {
      return {
        model_fingerprint: active_file,
        file: active_file,
        dims,
        value_count: vectors.length,
      };
    },
    get_file_path(file = active_file) {
      return `${data_dir}/${file}`;
    },
    get_vector(file, file_i) {
      if (file !== active_file || !Number.isInteger(file_i) || file_i < 0) return undefined;
      const start = file_i * dims;
      const end = start + dims;
      if (end > vectors.length) return undefined;
      return vectors.subarray(start, end);
    },
    has_current_vector_ref(item, _type, file_info = this.get_active_file_info()) {
      const ref = item.data?.embedding?.default?.[file_info.model_fingerprint];
      if (ref?.file !== file_info.file || !Number.isInteger(ref.file_i) || ref.file_i < 0) return false;
      if (!ref.read_hash || ref.read_hash !== item.read_hash) return false;
      return (ref.file_i + 1) * file_info.dims <= file_info.value_count;
    },
  };
}

function create_embedding_data(file_i, read_hash, params = {}) {
  return {
    default: {
      mf_test: {
        file: 'mf_test',
        file_i,
        read_hash,
        at: params.at || 1,
      },
      ...(params.other_refs || {}),
    },
    history: params.history || [],
  };
}

function get_float_values(files, path) {
  return Array.from(new Float32Array(files.get(path)));
}

function parse_optimized_sources(plan, files) {
  const source_data = {};
  for (const file of plan.new_source_files) {
    const content = files.get(file.temporary_path) || '';
    for (const line of content.split('\n')) {
      if (!line) continue;
      const parsed = JSON.parse(`{${line.replace(/,\s*$/, '')}}`);
      for (const [key, data] of Object.entries(parsed)) {
        source_data[key.slice('smart_sources:'.length)] = data;
      }
    }
  }
  return source_data;
}

function create_adapter(params = {}) {
  const files = params.files || new Map();
  const directories = params.directories || new Set();
  const operations = [];
  const fs = {
    sep: '/',
    on_append: null,
    on_read: null,
    on_remove: null,
    on_rename: null,
    on_stat: null,
    on_write: null,
    on_write_binary: null,
    adapter: {
      async append(path, content) {
        operations.push(`append:${path}`);
        files.set(path, `${files.get(path) || ''}${content}`);
        await fs.on_append?.(path, content);
      },
      async rename(old_path, new_path) {
        operations.push(`rename:${old_path}:${new_path}`);
        files.set(new_path, files.get(old_path));
        files.delete(old_path);
        await fs.on_rename?.(old_path, new_path);
      },
      async remove(path) {
        operations.push(`remove:${path}`);
        files.delete(path);
        await fs.on_remove?.(path);
      },
    },
    async exists(path) {
      return files.has(path)
        || directories.has(path)
        || Array.from(files.keys()).some((file_path) => file_path.startsWith(`${path}/`))
      ;
    },
    async mkdir(path) {
      directories.add(path);
    },
    async write(path, content) {
      operations.push(`write:${path}`);
      files.set(path, content);
      await this.on_write?.(path, content);
    },
    async read(path) {
      operations.push(`read:${path}`);
      await this.on_read?.(path);
      return files.get(path) || '';
    },
    async read_binary(path) {
      operations.push(`read_binary:${path}`);
      const content = files.get(path);
      return content?.slice?.(0) || content;
    },
    async write_binary(path, buffer) {
      operations.push(`write_binary:${path}`);
      files.set(path, buffer.slice(0));
      await this.on_write_binary?.(path, buffer);
    },
    async stat(path) {
      operations.push(`stat:${path}`);
      await this.on_stat?.(path);
      const content = files.get(path);
      return {
        size: typeof content === 'string'
          ? get_utf8_byte_length(content)
          : content?.byteLength || 0
        ,
      };
    },
    async list(path) {
      const prefix = `${path}/`;
      return Array.from(files.keys())
        .filter((file_path) => file_path.startsWith(prefix))
        .map((file_path) => file_path.slice(prefix.length))
      ;
    },
    async remove(path) {
      return await this.adapter.remove(path);
    },
    async rename(old_path, new_path) {
      return await this.adapter.rename(old_path, new_path);
    },
  };

  class TestBlock {
    constructor(env) {
      this.env = env;
      this._queue_embed = false;
    }

    get key() { return this._block_key; }
    get data() { return this._data_ref || {}; }
    get should_embed() { return false; }
    get_should_embed() { return false; }
  }

  const block_collection = {
    items: {},
    item_class_name: 'SmartBlock',
    data_dir: 'smart_blocks',
    data_fs: fs,
    item_type: TestBlock,
    settings: {},
    embeddings: create_embeddings(),
    get(key) {
      return this.items[key];
    },
    set(block) {
      this.items[block.key] = block;
    },
    async process_save_queue() {},
  };
  const env = {
    data_fs: fs,
    smart_blocks: block_collection,
  };
  const collection = {
    collection_key: 'smart_sources',
    data_dir: 'smart_sources',
    data_fs: fs,
    env,
    items: {},
    item_class_name: 'SmartSource',
    embeddings: create_embeddings(),
    emit_event() {},
    get(key) {
      return this.items[key];
    },
    async process_save_queue() {},
  };

  const adapter = new AjsonShardedSourcesDataAdapter(collection);
  if (params.max_bytes_per_shard !== undefined) {
    Object.defineProperty(adapter, 'max_bytes_per_shard', {
      value: params.max_bytes_per_shard,
    });
  }

  return {
    adapter,
    block_collection,
    collection,
    directories,
    env,
    files,
    fs,
    operations,
  };
}

function create_source(collection, params = {}) {
  const key = params.key || 'Notes/Test.md';
  const source = {
    key,
    collection_key: 'smart_sources',
    collection,
    env: collection.env,
    data: params.data || {
      blocks_data: {},
    },
    file: params.file || null,
    source_adapter: params.source_adapter,
    should_embed: params.should_embed === true,
    read_hash: params.read_hash || '',
    deleted: params.deleted === true,
    _queue_embed: false,
    _queue_save: params.queue_save === true,
    get blocks_initialized() {
      return this.data.blocks_data !== undefined;
    },
    get block_keys() {
      return Object.keys(this.data.blocks_data || {});
    },
    has_block(sub_key) {
      return Object.prototype.hasOwnProperty.call(this.data.blocks_data || {}, sub_key);
    },
    get_block_lines(sub_key) {
      return this.data.blocks_data?.[sub_key]?.lines;
    },
    queue_save() {
      this._queue_save = true;
    },
  };
  collection.items[key] = source;
  return source;
}

function parse_source_line(line, source_key) {
  const parsed = JSON.parse(`{${line.replace(/,\s*$/, '')}}`);
  return parsed[`smart_sources:${source_key}`];
}

function create_sized_source(adapter, collection, key, size_bytes) {
  const source = {
    key,
    collection_key: 'smart_sources',
    collection,
    data: {
      payload: '',
    },
  };
  const empty_size_bytes = get_utf8_byte_length(adapter.get_source_ajson(source));
  source.data.payload = 'x'.repeat(size_bytes - empty_size_bytes);
  return source;
}

test('adapter exposes the current platform byte threshold', (t) => {
  const { adapter } = create_adapter();

  t.is(adapter.max_bytes_per_shard, DEFAULT_MAX_BYTES_PER_SHARD);
});

test('compaction suggestion requires half a shard and 2x projected compacted bytes', (t) => {
  const { adapter, collection } = create_adapter({ max_bytes_per_shard: TEST_MAX_BYTES_PER_SHARD });
  const min_reclaimable_bytes = adapter.max_bytes_per_shard / 2;

  create_source(collection, { key: 'Notes/First.md' });
  create_source(collection, { key: 'Notes/Second.md' });
  adapter.get_source_ajson = () => 'x'.repeat(6);

  const projected_compacted_bytes = 13;
  t.false(adapter.should_suggest_compaction([{
    size_bytes: projected_compacted_bytes * 2,
  }]));
  t.false(adapter.should_suggest_compaction([{
    size_bytes: projected_compacted_bytes + min_reclaimable_bytes - 1,
  }]));
  t.true(adapter.should_suggest_compaction([{
    size_bytes: projected_compacted_bytes + min_reclaimable_bytes,
  }]));

  const large_projected_compacted_bytes = min_reclaimable_bytes * 2;
  adapter.get_source_ajson = () => 'x'.repeat(min_reclaimable_bytes);
  t.false(adapter.should_suggest_compaction([{
    size_bytes: large_projected_compacted_bytes * 2 - 1,
  }]));
  t.true(adapter.should_suggest_compaction([{
    size_bytes: large_projected_compacted_bytes * 2,
  }]));
});

test('load ignores maintenance-only compaction reasons without material byte savings', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
  } = create_adapter({ max_bytes_per_shard: 128 });
  const source_key = 'Notes/Test.md';
  const block_key = `${source_key}#Heading`;
  const source = create_source(collection, { key: source_key });
  create_source(collection, { key: 'Notes/Second.md' });

  files.set(adapter.get_ajson_file_path(0), [
    `"smart_sources:${source_key}": {"blocks":{},"blocks_data":{"#Heading":{"lines":[1,2],"embedding":{"default":{"file":"mf_test","file_i":0,"read_hash":"block-hash","at":1},"history":[]}}},"embedding":{"default":{"file":"mf_test","file_i":0,"read_hash":"source-hash","at":1},"history":[]}},`,
    '"smart_sources:Notes/Second.md": {"blocks_data":{}},',
  ].join('\n'));

  let source_migration_count = 0;
  collection.embeddings.migrate_legacy_item_vectors = async () => {
    source_migration_count += 1;
    source.data.embedding.default = { mf_test: source.data.embedding.default };
    return 1;
  };
  let block_migration_count = 0;
  block_collection.embeddings.migrate_legacy_item_vectors = async () => {
    block_migration_count += 1;
    const block = block_collection.get(block_key);
    block.data.embedding.default = { mf_test: block.data.embedding.default };
    return 1;
  };
  let notice_shown = false;
  adapter.show_compact_notice_after_load = () => {
    notice_shown = true;
  };

  await adapter.process_load_queue();

  t.true(adapter._needs_minimal_rewrite);
  t.is(source_migration_count, 1);
  t.is(block_migration_count, 1);
  t.true(adapter._ajson_file_infos[0].size_bytes > adapter.max_bytes_per_shard);
  t.is(adapter._ajson_file_infos[0].record_count, 2);
  t.false(notice_shown);
});

test('long source paths persist in fixed shards without legacy filename probes', async (t) => {
  const { adapter, collection, files } = create_adapter();
  const source_key = `Notes/${'x'.repeat(220)}.md`;
  const source = create_source(collection, { key: source_key });

  t.deepEqual(await adapter.list_legacy_files(), []);

  await adapter.append_sources([source]);

  const base_path = adapter.get_ajson_file_path(0);
  t.true(files.has(base_path));
  t.true(files.get(base_path).includes(source_key));
});

test('source save serializes blocks_data directly without a blocks index or recursive sanitizer', (t) => {
  const { adapter, collection } = create_adapter();
  const source_key = 'Notes/Test.md';
  const source = create_source(collection, {
    key: source_key,
    data: {
      key: source_key,
      blocks_data: {
        '#Heading': {
          key: `${source_key}#Heading`,
          lines: [1, 3],
          metadata: {
            vec_i: 'metadata-value',
            mem_i: 'metadata-value',
            embeddings: 'metadata-value',
            last_embed: 'metadata-value',
          },
        },
      },
    },
  });

  const saved = parse_source_line(adapter.get_source_ajson(source), source_key);

  t.false(Object.prototype.hasOwnProperty.call(saved, 'blocks'));
  t.deepEqual(saved.blocks_data, source.data.blocks_data);
  t.deepEqual(saved.blocks_data['#Heading'].metadata, {
    vec_i: 'metadata-value',
    mem_i: 'metadata-value',
    embeddings: 'metadata-value',
    last_embed: 'metadata-value',
  });
});

test('normal sharded parsing ignores data.blocks and standalone smart_blocks records', async (t) => {
  const { adapter, block_collection, collection } = create_adapter();
  const source_key = 'Notes/Test.md';
  const source = create_source(collection, {
    key: source_key,
    data: {
      blocks_data: {
        '#Old': {
          key: `${source_key}#Old`,
          lines: [9, 9],
        },
      },
    },
  });
  block_collection.items[`${source_key}#Old`] = {
    key: `${source_key}#Old`,
  };

  await adapter.parse_ajson([
    `"smart_sources:${source_key}": {"blocks":{"#Legacy":[5,5]},"blocks_data":{"#Current":{"key":"${source_key}#Current","lines":[1,3],"payload":"current"}}},`,
    `"smart_blocks:${source_key}#Standalone": {"lines":[4,4],"payload":"legacy"},`,
  ].join('\n'));

  t.false(Object.prototype.hasOwnProperty.call(source.data, 'blocks'));
  t.deepEqual(Object.keys(source.data.blocks_data), ['#Current']);
  t.is(source.data.blocks_data['#Current'].payload, 'current');
  t.deepEqual(Object.keys(block_collection.items), [`${source_key}#Current`]);
  t.true(adapter._needs_minimal_rewrite);
});

test('legacy property-stream parsing accepts concatenated source and block records', async (t) => {
  const { adapter, block_collection, collection } = create_adapter();
  const source_key = 'Notes/Test.md';
  const source = create_source(collection, { key: source_key });
  const source_and_first_block = [
    `"smart_sources:${source_key}": {"blocks":{"#Shared":[1,3],"#IndexOnly":[4,5]},"blocks_data":{"#Shared":{"lines":[9,9],"payload":"source"},"#Orphan":{"lines":[8,8]}}},`,
    `"smart_blocks:${source_key}#Shared": {"lines":[7,7],"payload":"standalone"},`,
  ].join('');

  await adapter.parse_ajson([
    source_and_first_block,
    `"smart_blocks:${source_key}#IndexOnly": {"payload":"index-only"},`,
    `"smart_blocks:${source_key}#StandaloneOnly": {"lines":[6,6],"payload":"ignored"},`,
  ].join('\n'), null, { legacy_mode: true });

  t.false(Object.prototype.hasOwnProperty.call(source.data, 'blocks'));
  t.deepEqual(Object.keys(source.data.blocks_data), ['#Shared', '#IndexOnly']);
  t.deepEqual(source.data.blocks_data['#Shared'].lines, [1, 3]);
  t.is(source.data.blocks_data['#Shared'].payload, 'standalone');
  t.deepEqual(source.data.blocks_data['#IndexOnly'].lines, [4, 5]);
  t.is(source.data.blocks_data['#IndexOnly'].payload, 'index-only');
  t.false(Object.prototype.hasOwnProperty.call(source.data.blocks_data, '#Orphan'));
  t.false(Object.prototype.hasOwnProperty.call(source.data.blocks_data, '#StandaloneOnly'));
  t.deepEqual(Object.keys(block_collection.items), [
    `${source_key}#Shared`,
    `${source_key}#IndexOnly`,
  ]);
});

test('legacy source without initialized data.blocks remains queued for import', async (t) => {
  const { adapter, block_collection, collection } = create_adapter();
  const source_key = 'Notes/Uninitialized.md';
  const source = create_source(collection, { key: source_key });

  await adapter.parse_ajson([
    `"smart_sources:${source_key}": {"last_read":{"hash":"legacy"}},`,
    `"smart_blocks:${source_key}#Standalone": {"lines":[1,1],"payload":"ignored"},`,
  ].join('\n'), null, { legacy_mode: true });

  t.false(Object.prototype.hasOwnProperty.call(source.data, 'blocks'));
  t.false(Object.prototype.hasOwnProperty.call(source.data, 'blocks_data'));
  t.false(source.blocks_initialized);
  t.deepEqual(Object.keys(block_collection.items), []);
});

test('numbered shards are not committed without the base shard', async (t) => {
  const { adapter, files } = create_adapter();
  files.set('smart_sources/smart_sources_1.ajson', '"smart_sources:Notes/Test.md": {},');

  t.deepEqual(await adapter.list_ajson_data_files(), []);
  t.deepEqual(
    (await adapter.list_ajson_data_files({ require_base: false })).map((info) => info.file_i),
    [1],
  );
});

test('ordinary append cannot commit orphan numbered shards', async (t) => {
  const { adapter, files } = create_adapter();
  const base_path = adapter.get_ajson_file_path(0);
  const orphan_path = adapter.get_ajson_file_path(1);
  const orphan_content = '"smart_sources:Notes/Test.md": {"version":"orphan"},';
  files.set(orphan_path, orphan_content);

  await t.throwsAsync(
    () => adapter.append_sources([{
      key: 'Notes/Test.md',
      collection_key: 'smart_sources',
      data: { version: 'current' },
    }]),
    {
      message: 'Cannot append source AJSON while numbered shards exist without shard 0. '
        + 'Run recover_uncommitted_shards() first.',
    },
  );

  t.false(files.has(base_path));
  t.is(files.get(orphan_path), orphan_content);
});

test('ordinary compaction cannot commit orphan numbered shards', async (t) => {
  const { adapter, collection, files } = create_adapter();
  create_source(collection, {
    key: 'Notes/Test.md',
    data: {
      blocks_data: {},
      version: 'current',
    },
  });
  const base_path = adapter.get_ajson_file_path(0);
  const orphan_path = adapter.get_ajson_file_path(1);
  const orphan_content = '"smart_sources:Notes/Test.md": {"version":"orphan"},';
  files.set(orphan_path, orphan_content);

  await t.throwsAsync(
    () => adapter.compact_shards(),
    {
      message: 'Cannot compact source AJSON while numbered shards exist without shard 0. '
        + 'Run recover_uncommitted_shards() first.',
    },
  );

  t.false(files.has(base_path));
  t.false(files.has(`${base_path}.tmp`));
  t.is(files.get(orphan_path), orphan_content);
});

test('explicit recovery replaces orphan shards before committing the base shard', async (t) => {
  const {
    adapter,
    collection,
    files,
    operations,
  } = create_adapter({ max_bytes_per_shard: 128 });
  const first_source = create_sized_source(adapter, collection, 'Notes/First.md', 96);
  const second_source = create_sized_source(adapter, collection, 'Notes/Second.md', 96);
  collection.items = {
    [first_source.key]: first_source,
    [second_source.key]: second_source,
  };

  const base_path = adapter.get_ajson_file_path(0);
  const shard_1_path = adapter.get_ajson_file_path(1);
  const shard_2_path = adapter.get_ajson_file_path(2);
  files.set(shard_1_path, '"smart_sources:Notes/Old.md": {"version":1},');
  files.set(shard_2_path, '"smart_sources:Notes/Stale.md": {"version":2},');

  const result = await adapter.recover_uncommitted_shards();

  t.deepEqual(parse_source_line(files.get(base_path), first_source.key), first_source.data);
  t.deepEqual(parse_source_line(files.get(shard_1_path), second_source.key), second_source.data);
  t.false(files.has(shard_2_path));
  t.is(result.before.shards, 2);
  t.is(result.after.shards, 2);

  const base_temp_write_i = operations.indexOf(`write:${base_path}.tmp`);
  const shard_1_temp_write_i = operations.indexOf(`write:${shard_1_path}.tmp`);
  const shard_1_backup_i = operations.indexOf(`rename:${shard_1_path}:${shard_1_path}.bak`);
  const shard_1_commit_i = operations.indexOf(`rename:${shard_1_path}.tmp:${shard_1_path}`);
  const shard_2_remove_i = operations.indexOf(`remove:${shard_2_path}`);
  const base_commit_i = operations.indexOf(`rename:${base_path}.tmp:${base_path}`);

  t.true(base_temp_write_i >= 0);
  t.true(shard_1_temp_write_i >= 0);
  t.true(base_temp_write_i < shard_1_backup_i);
  t.true(shard_1_temp_write_i < shard_1_backup_i);
  t.true(shard_1_backup_i < shard_1_commit_i);
  t.true(shard_1_commit_i < shard_2_remove_i);
  t.true(shard_2_remove_i < base_commit_i);
});

test('append rotation and compaction keep shards within the byte threshold', async (t) => {
  const {
    adapter,
    collection,
    files,
  } = create_adapter({ max_bytes_per_shard: TEST_MAX_BYTES_PER_SHARD });
  const exact_source = create_sized_source(
    adapter,
    collection,
    'Notes/Exact.md',
    TEST_MAX_BYTES_PER_SHARD,
  );
  const small_source = create_sized_source(adapter, collection, 'Notes/Small.md', 256);
  const stale_source = {
    key: 'Notes/Stale.md',
    collection_key: 'smart_sources',
    deleted: true,
  };

  await adapter.append_sources([exact_source, small_source, stale_source]);

  const base_path = adapter.get_ajson_file_path(0);
  const next_path = adapter.get_ajson_file_path(1);
  t.is(get_utf8_byte_length(files.get(base_path)), TEST_MAX_BYTES_PER_SHARD);
  t.is(files.get(next_path).split('\n').length, 2);
  t.false(adapter.should_rotate_append_file({ size_bytes: TEST_MAX_BYTES_PER_SHARD - 10 }, 10, 1));
  t.true(adapter.should_rotate_append_file({ size_bytes: TEST_MAX_BYTES_PER_SHARD - 10 }, 11, 1));
  t.false(adapter.should_rotate_append_file({ size_bytes: 0 }, TEST_MAX_BYTES_PER_SHARD + 1, 1));
  t.true(adapter.should_rotate_append_file({ size_bytes: 0 }, TEST_MAX_BYTES_PER_SHARD + 2, 2));

  collection.items = {
    [exact_source.key]: exact_source,
    [small_source.key]: small_source,
  };

  const result = await adapter.compact_shards();

  t.is(get_utf8_byte_length(files.get(base_path)), TEST_MAX_BYTES_PER_SHARD);
  t.is(files.get(next_path).split('\n').length, 1);
  t.is(result.before.records, 3);
  t.is(result.before.shards, 2);
  t.is(result.after.records, 2);
  t.is(result.after.shards, 2);
  t.true(result.before.bytes > result.after.bytes);
  t.true(result.duration_ms >= 0);
});

test('a later process discovers shard size without reading and rotates past full or oversized shards', async (t) => {
  const files = new Map();
  const first_process = create_adapter({
    files,
    max_bytes_per_shard: TEST_MAX_BYTES_PER_SHARD,
  });
  const base_source = create_sized_source(
    first_process.adapter,
    first_process.collection,
    'Notes/Base.md',
    TEST_MAX_BYTES_PER_SHARD,
  );
  const base_path = first_process.adapter.get_ajson_file_path(0);
  files.set(base_path, first_process.adapter.get_source_ajson(base_source));
  first_process.fs.on_read = async () => t.fail('append discovery should not read shard content');

  await first_process.adapter.append_sources([{
    key: 'Notes/First-Rotated.md',
    collection_key: 'smart_sources',
    data: {},
  }]);

  const shard_1_path = first_process.adapter.get_ajson_file_path(1);
  t.is(files.get(shard_1_path).split('\n').length, 1);

  const oversized_source = create_sized_source(
    first_process.adapter,
    first_process.collection,
    'Notes/Oversized.md',
    TEST_MAX_BYTES_PER_SHARD + 1,
  );
  files.set(shard_1_path, first_process.adapter.get_source_ajson(oversized_source));

  const next_process = create_adapter({
    files,
    max_bytes_per_shard: TEST_MAX_BYTES_PER_SHARD,
  });
  next_process.fs.on_read = async () => t.fail('append discovery should not read shard content');
  await next_process.adapter.append_sources([{
    key: 'Notes/After-Oversized.md',
    collection_key: 'smart_sources',
    data: {},
  }]);

  const shard_2_path = next_process.adapter.get_ajson_file_path(2);
  t.is(get_utf8_byte_length(files.get(shard_1_path)), TEST_MAX_BYTES_PER_SHARD + 1);
  t.is(files.get(shard_2_path).split('\n').length, 1);
});

test('one oversized source record is written alone before the next shard rotates', async (t) => {
  const { adapter, collection, files } = create_adapter({
    max_bytes_per_shard: TEST_MAX_BYTES_PER_SHARD,
  });
  const oversized_source = {
    key: 'Notes/Oversized.md',
    collection_key: 'smart_sources',
    collection,
    data: {
      payload: 'é'.repeat(Math.ceil(TEST_MAX_BYTES_PER_SHARD / 2)),
    },
  };
  const small_source = create_sized_source(adapter, collection, 'Notes/Small.md', 256);
  const oversized_line = adapter.get_source_ajson(oversized_source);
  const oversized_size_bytes = get_utf8_byte_length(oversized_line);

  t.true(oversized_line.length < TEST_MAX_BYTES_PER_SHARD);
  t.true(oversized_size_bytes > TEST_MAX_BYTES_PER_SHARD);

  await adapter.append_sources([oversized_source, small_source]);

  t.is(
    get_utf8_byte_length(files.get(adapter.get_ajson_file_path(0))),
    oversized_size_bytes,
  );
  t.is(files.get(adapter.get_ajson_file_path(1)).split('\n').length, 1);
});

test('shards replay numerically and the last physical record wins', async (t) => {
  const {
    adapter,
    collection,
    files,
    operations,
  } = create_adapter();
  const source_key = 'Notes/Test.md';
  const source = create_source(collection, { key: source_key });
  const base_path = adapter.get_ajson_file_path(0);
  const shard_2_path = adapter.get_ajson_file_path(2);
  const shard_10_path = adapter.get_ajson_file_path(10);

  files.set(base_path, [
    `"smart_sources:${source_key}": {"version":"base"},`,
    `"smart_sources:${source_key}": {"version":"base-later"},`,
  ].join('\n'));
  files.set(shard_2_path, [
    `"smart_sources:${source_key}": null,`,
    `"smart_sources:${source_key}": {"version":"two"},`,
  ].join('\n'));
  files.set(shard_10_path, `"smart_sources:${source_key}": {"version":"ten"},`);

  const data_files = await adapter.list_ajson_data_files();
  t.deepEqual(data_files.map((info) => info.file_i), [0, 2, 10]);

  await adapter.parse_ajson_files(data_files.slice().reverse());

  t.is(source.data.version, 'ten');
  t.deepEqual(data_files.map((info) => info.record_count), [2, 2, 1]);
  t.deepEqual(
    operations.filter((operation) => operation.startsWith('read:')).map((operation) => operation.slice(5)),
    [base_path, shard_2_path, shard_10_path],
  );
});

test('ordinary append cannot create the commit marker while legacy migration is pending', async (t) => {
  const {
    adapter,
    directories,
    files,
  } = create_adapter();
  directories.add(adapter.legacy_data_dir);

  await t.throwsAsync(
    () => adapter.append_sources([{
      key: 'Notes/Deleted.md',
      collection_key: 'smart_sources',
      deleted: true,
    }]),
    { message: 'Cannot append source AJSON before legacy migration is committed.' },
  );
  await t.throwsAsync(
    () => adapter.recover_uncommitted_shards(),
    { message: 'Cannot recover uncommitted source AJSON while legacy migration is pending.' },
  );

  t.false(files.has(adapter.get_ajson_file_path(0)));
});

test('committed shard read errors abort load', async (t) => {
  const { adapter, files } = create_adapter();
  const base_path = adapter.get_ajson_file_path(0);
  files.set(base_path, { error: 'EIO' });

  const error = await t.throwsAsync(() => adapter.process_load_queue());

  t.is(error.message, `Failed to read AJSON file ${base_path}: EIO`);
});

test('shard stat errors abort append discovery', async (t) => {
  const { adapter, files, fs } = create_adapter();
  const base_path = adapter.get_ajson_file_path(0);
  files.set(base_path, '"smart_sources:Notes/Test.md": {},');
  fs.on_stat = async (path) => {
    if (path === base_path) throw new Error('EIO');
  };

  await t.throwsAsync(
    () => adapter.get_current_append_file_info(),
    { message: 'EIO' },
  );
});

test('legacy read errors abort before vector migration and base commit', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    directories,
    files,
  } = create_adapter();
  create_source(collection, { key: 'Notes/Test.md' });
  directories.add('multi');
  const [legacy_path] = await adapter.list_legacy_files();
  files.set(legacy_path, { error: 'EIO' });

  let source_migration_called = false;
  let block_migration_called = false;
  collection.embeddings.migrate_legacy_item_vectors = async () => {
    source_migration_called = true;
    return 0;
  };
  block_collection.embeddings.migrate_legacy_item_vectors = async () => {
    block_migration_called = true;
    return 0;
  };

  const error = await t.throwsAsync(() => adapter.process_load_queue());

  t.is(error.message, `Failed to read AJSON file ${legacy_path}: EIO`);
  t.false(source_migration_called);
  t.false(block_migration_called);
  t.false(files.has(adapter.get_ajson_file_path(0)));
  t.true(files.has(legacy_path));
});

test('load-time queue excludes a stale flag for a deselected block', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
  } = create_adapter();
  const source_key = 'Notes/Test.md';
  create_source(collection, { key: source_key });

  const block = new block_collection.item_type(collection.env);
  block._block_key = `${source_key}#Parent`;
  block._data_ref = { should_embed: false };
  block._queue_embed = true;
  block_collection.set(block);

  files.set(
    adapter.get_ajson_file_path(0),
    `"smart_sources:${source_key}": {"blocks_data":{"#Parent":{"lines":[1,2],"size":300,"should_embed":false}}},`,
  );

  await adapter.process_load_queue();

  t.false(block._queue_embed);
  t.deepEqual(collection._embed_queue, []);
  t.deepEqual(block_collection._embed_queue, []);
});

test('flat embedding refs trigger model fingerprint migration on load', async (t) => {
  const {
    adapter,
    collection,
    files,
  } = create_adapter();
  const source_key = 'Notes/Test.md';
  const source = create_source(collection, { key: source_key });
  files.set(adapter.get_ajson_file_path(0), [
    `\"smart_sources:${source_key}\": {`,
    '"blocks_data":{},',
    '"embedding":{',
    '"default":{"file":"mf_test","file_i":0,"read_hash":"source-hash","at":1},',
    '"history":[]',
    '}',
    '},',
  ].join(''));

  let migration_called = false;
  collection.embeddings.migrate_legacy_item_vectors = async () => {
    migration_called = true;
    const legacy_ref = source.data.embedding.default;
    source.data.embedding.default = {
      mf_test: legacy_ref,
    };
    return 1;
  };

  await adapter.process_load_queue();

  t.true(migration_called);
  t.is(source.data.embedding.default.mf_test.file_i, 0);
});

test('initial V2 migration preserves vectors from concatenated source and block records', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    directories,
    files,
    fs,
  } = create_adapter();
  const source_key = 'Notes/Test.md';
  const source = create_source(collection, { key: source_key });
  source.read_hash = 'source-hash';
  source.should_embed = true;
  directories.add('multi');
  const [legacy_path] = await adapter.list_legacy_files();
  const source_and_first_block = [
    `"smart_sources:${source_key}": {"blocks":{"#Shared":[1,3]},"embeddings":{"legacy":{"vec":[1,0]}},"last_embed":{"hash":"source-hash"}},`,
    `"smart_blocks:${source_key}#Shared": {"payload":"legacy","embeddings":{"legacy":{"vec":[0,1]}},"last_embed":{"hash":"block-hash"}},`,
  ].join('');
  files.set(legacy_path, [
    source_and_first_block,
    `"smart_blocks:${source_key}#StandaloneOnly": {"lines":[5,5],"payload":"ignored"},`,
  ].join('\n'));

  collection.embeddings.has_current_vector_ref = (item) => {
    return item.data.embedding?.default?.mf_test?.read_hash === item.read_hash;
  };
  block_collection.embeddings.has_current_vector_ref = (item) => {
    return item.data.embedding?.default?.mf_test?.read_hash === item.read_hash;
  };

  const order = [];
  collection.embeddings.migrate_legacy_item_vectors = async () => {
    order.push('source_vectors');
    delete source.data.embeddings;
    delete source.data.last_embed;
    source.data.embedding = {
      default: {
        mf_test: {
          file: 'mf_test',
          file_i: 0,
          read_hash: 'source-hash',
          at: 1,
        },
      },
      history: [],
    };
    source._queue_save = true;
    return 1;
  };
  block_collection.embeddings.migrate_legacy_item_vectors = async () => {
    order.push('block_vectors');
    const block = block_collection.get(`${source_key}#Shared`);
    block.read_hash = 'block-hash';
    block.get_should_embed = () => true;
    delete block.data.embeddings;
    delete block.data.last_embed;
    block.data.embedding = {
      default: {
        mf_test: {
          file: 'mf_test',
          file_i: 0,
          read_hash: 'block-hash',
          at: 1,
        },
      },
      history: [],
    };
    block._queue_save = true;
    source._queue_save = true;
    return 1;
  };
  fs.on_rename = async (_old_path, new_path) => {
    if (new_path === adapter.get_ajson_file_path(0)) order.push('base_commit');
  };

  await adapter.process_load_queue();

  const base_path = adapter.get_ajson_file_path(0);
  t.true(files.has(base_path));
  const saved = parse_source_line(files.get(base_path), source_key);
  t.false(Object.prototype.hasOwnProperty.call(saved, 'blocks'));
  t.deepEqual(Object.keys(saved.blocks_data), ['#Shared']);
  t.deepEqual(saved.blocks_data['#Shared'].lines, [1, 3]);
  t.is(saved.blocks_data['#Shared'].payload, 'legacy');
  t.is(saved.embedding.default.mf_test.file_i, 0);
  t.is(saved.blocks_data['#Shared'].embedding.default.mf_test.file_i, 0);
  t.false(Object.prototype.hasOwnProperty.call(saved.blocks_data, '#StandaloneOnly'));
  t.deepEqual(order, ['source_vectors', 'block_vectors', 'base_commit']);
  t.false(source._queue_save);
  t.false(source._queue_import);
  t.false(block_collection.get(`${source_key}#Shared`)._queue_save);
  t.deepEqual(collection._embed_queue, []);
  t.deepEqual(block_collection._embed_queue, []);

  let legacy_read_count = 0;
  fs.on_read = async (path) => {
    if (path.startsWith('multi/')) legacy_read_count += 1;
  };
  await adapter.process_load_queue();
  t.is(legacy_read_count, 0);
});

test('invalid legacy AJSON aborts before committing the sharded base marker', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    directories,
    files,
  } = create_adapter();
  const source_key = 'Notes/Test.md';
  create_source(collection, { key: source_key });
  directories.add('multi');
  const [legacy_path] = await adapter.list_legacy_files();
  files.set(
    legacy_path,
    `"smart_sources:${source_key}": {"blocks":{}} "smart_blocks:${source_key}#Broken": {},`,
  );

  let source_migration_called = false;
  let block_migration_called = false;
  collection.embeddings.migrate_legacy_item_vectors = async () => {
    source_migration_called = true;
    return 0;
  };
  block_collection.embeddings.migrate_legacy_item_vectors = async () => {
    block_migration_called = true;
    return 0;
  };

  const error = await t.throwsAsync(() => adapter.process_load_queue());

  t.true(error.message.startsWith(`Failed to parse legacy AJSON file ${legacy_path}:`));
  t.false(source_migration_called);
  t.false(block_migration_called);
  t.false(files.has(adapter.get_ajson_file_path(0)));
  t.true(files.has(legacy_path));
});

test('compaction fails when an obsolete shard remains after removal', async (t) => {
  const {
    adapter,
    collection,
    files,
    fs,
  } = create_adapter({ max_bytes_per_shard: TEST_MAX_BYTES_PER_SHARD });
  const source = create_source(collection, { key: 'Notes/Active.md' });
  const base_path = adapter.get_ajson_file_path(0);
  const obsolete_path = adapter.get_ajson_file_path(1);
  const obsolete_content = '"smart_sources:Notes/Stale.md": {"stale":true},';

  files.set(base_path, adapter.get_source_ajson(source));
  files.set(obsolete_path, obsolete_content);
  fs.on_remove = async (path) => {
    if (path === obsolete_path) files.set(path, obsolete_content);
  };

  await t.throwsAsync(
    () => adapter.compact_shards(),
    { message: `Failed to remove obsolete AJSON shard ${obsolete_path}` },
  );

  t.true(files.has(obsolete_path));
});

test('legacy migration does not commit the base while an obsolete shard remains', async (t) => {
  const {
    adapter,
    collection,
    files,
    fs,
  } = create_adapter({ max_bytes_per_shard: TEST_MAX_BYTES_PER_SHARD });
  create_source(collection, { key: 'Notes/Active.md' });
  const base_path = adapter.get_ajson_file_path(0);
  const obsolete_path = adapter.get_ajson_file_path(1);
  const obsolete_content = '"smart_sources:Notes/Stale.md": {"stale":true},';

  files.set(obsolete_path, obsolete_content);
  fs.on_remove = async (path) => {
    if (path === obsolete_path) files.set(path, obsolete_content);
  };

  await t.throwsAsync(
    () => adapter.commit_legacy_migration(),
    { message: `Failed to remove obsolete AJSON shard ${obsolete_path}` },
  );

  t.false(files.has(base_path));
  t.true(files.has(obsolete_path));
});

test('save, append, and rewrite operations share one AJSON write chain', async (t) => {
  const { adapter } = create_adapter();
  const calls = [];
  let active_count = 0;
  let max_active_count = 0;

  const run_write = async (label) => {
    active_count += 1;
    max_active_count = Math.max(max_active_count, active_count);
    calls.push(`start:${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    calls.push(`end:${label}`);
    active_count -= 1;
  };

  adapter._process_save_queue = async () => await run_write('save');
  adapter._append_sources = async () => await run_write('append');
  adapter._compact_shards = async () => await run_write('rewrite');

  await Promise.all([
    adapter.process_save_queue(),
    adapter.append_sources([{ key: 'Notes/Tombstone.md' }]),
    adapter.compact_shards(),
  ]);

  t.is(max_active_count, 1);
  t.deepEqual(calls, [
    'start:save',
    'end:save',
    'start:append',
    'end:append',
    'start:rewrite',
    'end:rewrite',
  ]);
});

test('queued save rechecks embedding deferral before writing refs', async (t) => {
  const { adapter, collection } = create_adapter();
  const source = create_source(collection, { queue_save: true });

  let release_previous_write;
  adapter._ajson_write_promise = new Promise((resolve) => {
    release_previous_write = resolve;
  });
  let append_called = false;
  adapter._append_sources = async () => {
    append_called = true;
  };

  const save_promise = adapter.process_save_queue();
  collection._defer_embed_saves = true;
  release_previous_write();
  await save_promise;

  t.false(append_called);
  t.true(source._queue_save);
});

test('changes queued during an append remain queued', async (t) => {
  const { adapter, block_collection, collection } = create_adapter();
  const source = create_source(collection, {
    data: {
      blocks_data: {
        '#Block': {
          key: 'Notes/Test.md#Block',
          lines: [1, 1],
        },
      },
    },
    queue_save: true,
  });
  const block = {
    key: 'Notes/Test.md#Block',
    _queue_save: true,
  };
  block_collection.items[block.key] = block;

  let mark_append_started;
  let finish_append;
  const append_started = new Promise((resolve) => {
    mark_append_started = resolve;
  });
  const append_finished = new Promise((resolve) => {
    finish_append = resolve;
  });
  adapter._append_sources = async () => {
    t.false(source._queue_save);
    t.false(block._queue_save);
    mark_append_started();
    await append_finished;
  };

  const save_promise = adapter.process_save_queue();
  await append_started;
  source._queue_save = true;
  block._queue_save = true;
  finish_append();
  await save_promise;

  t.true(source._queue_save);
  t.true(block._queue_save);
});

test('failed append restores source and block save flags', async (t) => {
  const { adapter, block_collection, collection } = create_adapter();
  const source = create_source(collection, {
    data: {
      blocks_data: {
        '#Block': {
          key: 'Notes/Test.md#Block',
          lines: [1, 1],
        },
      },
    },
    queue_save: true,
  });
  const block = {
    key: 'Notes/Test.md#Block',
    _queue_save: true,
  };
  block_collection.items[block.key] = block;
  adapter._append_sources = async () => {
    throw new Error('append failed');
  };

  await t.throwsAsync(
    () => adapter.process_save_queue(),
    { message: 'append failed' },
  );

  t.true(source._queue_save);
  t.true(block._queue_save);
});

test('Compaction refuses to run while embedding saves are deferred', async (t) => {
  const { adapter, collection } = create_adapter();
  collection._defer_embed_saves = true;

  await t.throwsAsync(
    () => adapter.compact_shards(),
    { message: 'Cannot compact AJSON data while embedding saves are deferred.' },
  );
});

test('Compaction does not clear changes queued during its rewrite', async (t) => {
  const { adapter, block_collection, collection, fs } = create_adapter();
  const source = create_source(collection, {
    data: {
      blocks_data: {
        '#Block': {
          key: 'Notes/Test.md#Block',
          lines: [1, 1],
        },
      },
    },
  });
  const block = {
    key: 'Notes/Test.md#Block',
    _queue_save: false,
  };
  block_collection.items[block.key] = block;
  fs.on_write = async (path) => {
    if (!path.endsWith('.tmp')) return;
    source._queue_save = true;
    block._queue_save = true;
  };

  await adapter.compact_shards();

  t.true(source._queue_save);
  t.true(block._queue_save);
});


test('Source Data Optimize persists vectors before embedding refs', async (t) => {
  const { adapter, block_collection, collection, fs } = create_adapter();
  const order = [];
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', []);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);
  collection.embeddings.save_dirty_files = async () => { order.push('source vectors'); };
  block_collection.embeddings.save_dirty_files = async () => { order.push('block vectors'); };
  block_collection.process_save_queue = async () => { order.push('block refs'); };
  collection.process_save_queue = async () => { order.push('source refs'); };

  const plan = await adapter.optimize_source_data();

  t.deepEqual(order, [
    'source vectors',
    'block vectors',
    'block refs',
    'source refs',
  ]);
  t.truthy(plan.stats);
});

test('Source Data Optimize does not persist refs or temporary files when vector persistence fails', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    fs,
    operations,
  } = create_adapter();
  const order = [];
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', []);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);
  collection.embeddings.save_dirty_files = async () => {
    order.push('source vectors');
    throw new Error('vector save failed');
  };
  block_collection.embeddings.save_dirty_files = async () => { order.push('block vectors'); };
  block_collection.process_save_queue = async () => { order.push('block refs'); };
  collection.process_save_queue = async () => { order.push('source refs'); };

  await t.throwsAsync(
    () => adapter.write_optimized_source_data_files(),
    { message: 'vector save failed' },
  );

  t.deepEqual(order, ['source vectors']);
  t.false(operations.some((operation) => operation.includes('.optimize.tmp')));
});

test('Source Data Optimize rejects any existing backup in either data directory', async (t) => {
  for (const backup_path of [
    'smart_sources/smart_sources_9.ajson.backup',
    'smart_blocks/mf_old.backup',
  ]) {
    const {
      adapter,
      block_collection,
      collection,
      files,
      fs,
      operations,
    } = create_adapter();
    collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', []);
    block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);
    files.set(backup_path, new ArrayBuffer(0));

    await t.throwsAsync(
      () => adapter.write_optimized_source_data_files(),
      { message: `Source data optimization backup already exists: ${backup_path}` },
    );

    t.false(operations.some((operation) => operation.includes('.optimize.tmp')));
  }
});

test('Finish optimization rechecks for backups before unloading or renaming', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
    operations,
  } = create_adapter();
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', []);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);

  const plan = await adapter.write_optimized_source_data_files();
  const backup_path = 'smart_sources/smart_sources_9.ajson.backup';
  files.set(backup_path, 'stale backup');
  const rename_count = operations.filter((operation) => operation.startsWith('rename:')).length;
  let reload_count = 0;
  const previous_window = globalThis.window;
  globalThis.window = {
    location: {
      reload() { reload_count += 1; },
    },
  };

  try {
    await t.throwsAsync(
      () => adapter.finish_source_data_optimization(plan),
      { message: `Source data optimization backup already exists: ${backup_path}` },
    );
  } finally {
    if (previous_window === undefined) delete globalThis.window;
    else globalThis.window = previous_window;
  }

  t.false(collection.embeddings.unloaded);
  t.false(block_collection.embeddings.unloaded);
  t.is(
    operations.filter((operation) => operation.startsWith('rename:')).length,
    rename_count,
  );
  t.is(reload_count, 0);
});

test('Finish optimization validates temporary file sizes before unloading or renaming', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
    operations,
  } = create_adapter();
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', [1, 2]);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);
  const source = create_source(collection, {
    should_embed: true,
    read_hash: 'source-hash',
    data: {
      blocks_data: {},
      embedding: create_embedding_data(0, 'source-hash'),
    },
  });
  source.source_adapter = { should_persist: true };

  const source_vector_path = collection.embeddings.get_file_path();
  const block_vector_path = block_collection.embeddings.get_file_path();
  files.set(source_vector_path, new Float32Array([1, 2]).buffer);
  files.set(block_vector_path, new ArrayBuffer(0));
  files.set(adapter.get_ajson_file_path(0), 'old base');

  const plan = await adapter.write_optimized_source_data_files();
  const temporary_path = plan.vector_files[0].temporary_path;
  files.set(temporary_path, new ArrayBuffer(0));
  const rename_count = operations.filter((operation) => operation.startsWith('rename:')).length;
  let reload_count = 0;
  const previous_window = globalThis.window;
  globalThis.window = {
    location: {
      reload() { reload_count += 1; },
    },
  };

  try {
    await t.throwsAsync(
      () => adapter.finish_source_data_optimization(plan),
      {
        message: `Failed to validate source data optimization temporary file ${temporary_path}.`,
      },
    );
  } finally {
    if (previous_window === undefined) delete globalThis.window;
    else globalThis.window = previous_window;
  }

  t.false(collection.embeddings.unloaded);
  t.false(block_collection.embeddings.unloaded);
  t.is(
    operations.filter((operation) => operation.startsWith('rename:')).length,
    rename_count,
  );
  t.true(files.has(source_vector_path));
  t.false(files.has(`${source_vector_path}.backup`));
  t.is(reload_count, 0);
});

test('Source Data Optimize writes dense vectors and remapped temporary source data without mutating live data', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
  } = create_adapter();
  collection.embeddings = create_optimization_embeddings(
    fs,
    'smart_sources',
    [10, 11, 20, 21, 30, 31],
  );
  block_collection.embeddings = create_optimization_embeddings(
    fs,
    'smart_blocks',
    [100, 101, 200, 201, 300, 301],
  );

  const source_a = create_source(collection, {
    key: 'Notes/A.md',
    should_embed: true,
    read_hash: 'source-a',
    data: {
      blocks_data: {
        '#Selected': {
          key: 'Notes/A.md#Selected',
          lines: [1, 2],
          size: 300,
          should_embed: true,
          embedding: create_embedding_data(2, 'block-selected', {
            history: [
              { file: 'mf_test', file_i: 0, read_hash: 'old', at: 1 },
            ],
          }),
        },
        '#Inactive': {
          key: 'Notes/A.md#Inactive',
          lines: [3, 4],
          size: 300,
          should_embed: false,
          embedding: create_embedding_data(1, 'block-inactive', {
            other_refs: {
              mf_old: {
                file: 'mf_old',
                file_i: 7,
                read_hash: 'old-block',
                at: 1,
              },
            },
          }),
        },
        '#Stale': {
          key: 'Notes/A.md#Stale',
          lines: [5, 6],
          size: 300,
          should_embed: true,
          embedding: create_embedding_data(0, 'stale-hash'),
        },
      },
      embedding: create_embedding_data(2, 'source-a', {
        history: [
          { file: 'mf_test', file_i: 1, read_hash: 'old-source', at: 1 },
          { file: 'mf_old', file_i: 4, read_hash: 'older-source', at: 1 },
        ],
      }),
    },
  });
  const source_b = create_source(collection, {
    key: 'Notes/B.md',
    should_embed: true,
    read_hash: 'source-b',
    data: {
      blocks_data: {},
      embedding: create_embedding_data(0, 'source-b'),
    },
  });
  source_a.source_adapter = { should_persist: true };
  source_b.source_adapter = { should_persist: true };

  block_collection.items['Notes/A.md#Selected'] = {
    key: 'Notes/A.md#Selected',
    data: source_a.data.blocks_data['#Selected'],
    read_hash: 'block-selected',
    deleted: false,
  };
  block_collection.items['Notes/A.md#Inactive'] = {
    key: 'Notes/A.md#Inactive',
    data: source_a.data.blocks_data['#Inactive'],
    read_hash: 'block-inactive',
    deleted: false,
  };
  block_collection.items['Notes/A.md#Stale'] = {
    key: 'Notes/A.md#Stale',
    data: source_a.data.blocks_data['#Stale'],
    read_hash: 'current-hash',
    deleted: false,
  };

  const source_vector_path = collection.embeddings.get_file_path();
  const block_vector_path = block_collection.embeddings.get_file_path();
  files.set(source_vector_path, new Float32Array([10, 11, 20, 21, 30, 31]).buffer);
  files.set(block_vector_path, new Float32Array([100, 101, 200, 201, 300, 301]).buffer);
  files.set(adapter.get_ajson_file_path(0), 'old base');
  files.set(adapter.get_ajson_file_path(1), 'old shard');

  const before_source_a = JSON.stringify(source_a.data);
  const before_source_b = JSON.stringify(source_b.data);
  const plan = await adapter.write_optimized_source_data_files();
  const optimized = parse_optimized_sources(plan, files);

  t.deepEqual(
    get_float_values(files, `${source_vector_path}.optimize.tmp`),
    [10, 11, 30, 31],
  );
  t.deepEqual(
    get_float_values(files, `${block_vector_path}.optimize.tmp`),
    [300, 301],
  );
  t.is(optimized['Notes/A.md'].embedding.default.mf_test.file_i, 1);
  t.is(optimized['Notes/B.md'].embedding.default.mf_test.file_i, 0);
  t.is(
    optimized['Notes/A.md'].blocks_data['#Selected'].embedding.default.mf_test.file_i,
    0,
  );
  t.false(Boolean(
    optimized['Notes/A.md'].blocks_data['#Inactive'].embedding.default?.mf_test
  ));
  t.is(
    optimized['Notes/A.md'].blocks_data['#Inactive'].embedding.default.mf_old.file_i,
    7,
  );
  t.false(Boolean(
    optimized['Notes/A.md'].blocks_data['#Stale'].embedding.default?.mf_test
  ));
  t.deepEqual(optimized['Notes/A.md'].embedding.history, [
    { file: 'mf_old', file_i: 4, read_hash: 'older-source', at: 1 },
  ]);
  t.deepEqual(
    optimized['Notes/A.md'].blocks_data['#Selected'].embedding.history,
    [],
  );
  t.is(plan.stats.unexpected_refs_removed, 1);
  t.is(plan.stats.removed_refs, 2);
  t.is(plan.stats.removed_history_refs, 2);
  t.is(plan.stats.retained_source_rows, 2);
  t.is(plan.stats.retained_block_rows, 1);
  t.is(JSON.stringify(source_a.data), before_source_a);
  t.is(JSON.stringify(source_b.data), before_source_b);
  t.is(files.get(adapter.get_ajson_file_path(0)), 'old base');
  t.is(files.get(adapter.get_ajson_file_path(1)), 'old shard');
});

test('Finish optimization backs up every canonical file, promotes temporary files, and reloads', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
  } = create_adapter();
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', [1, 2]);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', [3, 4]);

  const source = create_source(collection, {
    key: 'Notes/Test.md',
    should_embed: true,
    read_hash: 'source-hash',
    data: {
      blocks_data: {
        '#Block': {
          key: 'Notes/Test.md#Block',
          lines: [1, 1],
          size: 300,
          should_embed: true,
          embedding: create_embedding_data(0, 'block-hash'),
        },
      },
      embedding: create_embedding_data(0, 'source-hash'),
    },
  });
  block_collection.items['Notes/Test.md#Block'] = {
    key: 'Notes/Test.md#Block',
    data: source.data.blocks_data['#Block'],
    read_hash: 'block-hash',
    deleted: false,
  };

  const source_vector_path = collection.embeddings.get_file_path();
  const block_vector_path = block_collection.embeddings.get_file_path();
  const old_source_vectors = new Float32Array([1, 2]).buffer;
  const old_block_vectors = new Float32Array([3, 4]).buffer;
  files.set(source_vector_path, old_source_vectors);
  files.set(block_vector_path, old_block_vectors);
  files.set(adapter.get_ajson_file_path(0), 'old base');
  files.set(adapter.get_ajson_file_path(1), 'obsolete shard');

  const plan = await adapter.write_optimized_source_data_files();
  const optimized_source_vectors = files.get(`${source_vector_path}.optimize.tmp`).slice(0);
  const optimized_block_vectors = files.get(`${block_vector_path}.optimize.tmp`).slice(0);
  const optimized_source_data = files.get(plan.new_source_files[0].temporary_path);
  let reload_count = 0;
  const previous_window = globalThis.window;
  globalThis.window = {
    location: {
      reload() { reload_count += 1; },
    },
  };

  try {
    await adapter.finish_source_data_optimization(plan);
  } finally {
    if (previous_window === undefined) delete globalThis.window;
    else globalThis.window = previous_window;
  }

  t.deepEqual(
    get_float_values(files, source_vector_path),
    Array.from(new Float32Array(optimized_source_vectors)),
  );
  t.deepEqual(
    get_float_values(files, block_vector_path),
    Array.from(new Float32Array(optimized_block_vectors)),
  );
  t.deepEqual(
    get_float_values(files, `${source_vector_path}.backup`),
    Array.from(new Float32Array(old_source_vectors)),
  );
  t.deepEqual(
    get_float_values(files, `${block_vector_path}.backup`),
    Array.from(new Float32Array(old_block_vectors)),
  );
  t.is(files.get(adapter.get_ajson_file_path(0)), optimized_source_data);
  t.is(files.get(`${adapter.get_ajson_file_path(0)}.backup`), 'old base');
  t.is(files.get(`${adapter.get_ajson_file_path(1)}.backup`), 'obsolete shard');
  t.false(files.has(adapter.get_ajson_file_path(1)));
  t.false(files.has(`${source_vector_path}.optimize.tmp`));
  t.false(files.has(`${block_vector_path}.optimize.tmp`));
  t.true(collection.embeddings.unloaded);
  t.true(block_collection.embeddings.unloaded);
  t.is(reload_count, 1);
});

test('Finish optimization replaces prior backups with current environment data when confirmed', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
  } = create_adapter();
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', [1, 2]);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', [3, 4]);

  const source_vector_path = collection.embeddings.get_file_path();
  const block_vector_path = block_collection.embeddings.get_file_path();
  const source_vectors = new Float32Array([1, 2]).buffer;
  const block_vectors = new Float32Array([3, 4]).buffer;
  const source_data_path = adapter.get_ajson_file_path(0);
  files.set(source_vector_path, source_vectors);
  files.set(block_vector_path, block_vectors);
  files.set(source_data_path, 'current source data');
  files.set(`${source_vector_path}.backup`, new Float32Array([9, 9]).buffer);
  files.set(`${block_vector_path}.backup`, new Float32Array([8, 8]).buffer);
  files.set(`${source_data_path}.backup`, 'prior source data');
  files.set('smart_sources/smart_sources_9.ajson.backup', 'stale prior shard');

  const plan = await adapter.optimize_source_data({
    replace_existing_backups: true,
  });
  t.deepEqual(get_float_values(files, `${source_vector_path}.backup`), [9, 9]);
  t.deepEqual(get_float_values(files, `${block_vector_path}.backup`), [8, 8]);
  t.is(files.get(`${source_data_path}.backup`), 'prior source data');
  t.is(files.get('smart_sources/smart_sources_9.ajson.backup'), 'stale prior shard');

  let reload_count = 0;
  const previous_window = globalThis.window;
  globalThis.window = {
    location: {
      reload() { reload_count += 1; },
    },
  };

  try {
    await adapter.finish_source_data_optimization(plan);
  } finally {
    if (previous_window === undefined) delete globalThis.window;
    else globalThis.window = previous_window;
  }

  t.deepEqual(get_float_values(files, `${source_vector_path}.backup`), [1, 2]);
  t.deepEqual(get_float_values(files, `${block_vector_path}.backup`), [3, 4]);
  t.is(files.get(`${source_data_path}.backup`), 'current source data');
  t.false(files.has('smart_sources/smart_sources_9.ajson.backup'));
  t.deepEqual(get_float_values(files, source_vector_path), []);
  t.deepEqual(get_float_values(files, block_vector_path), []);
  t.is(files.get(source_data_path), '');
  t.is(reload_count, 1);
});

test('Confirmed backup replacement preserves prior backups when temporary validation fails', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
  } = create_adapter();
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', [1, 2]);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);
  const backup_path = `${collection.embeddings.get_file_path()}.backup`;
  const prior_backup = new Float32Array([9, 9]).buffer;
  files.set(backup_path, prior_backup);

  const plan = await adapter.optimize_source_data({
    replace_existing_backups: true,
  });
  const temporary_path = plan.vector_files[0].temporary_path;
  files.set(temporary_path, new ArrayBuffer(4));

  await t.throwsAsync(
    () => adapter.finish_source_data_optimization(plan),
    {
      message: `Failed to validate source data optimization temporary file ${temporary_path}.`,
    },
  );

  t.is(files.get(backup_path), prior_backup);
  t.false(collection.embeddings.unloaded);
  t.false(block_collection.embeddings.unloaded);
});

test('Source Data Optimize refuses to overwrite an existing backup before writing temporary files', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
    operations,
  } = create_adapter();
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', []);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);
  const backup_path = `${collection.embeddings.get_file_path()}.backup`;
  files.set(backup_path, new ArrayBuffer(0));

  await t.throwsAsync(
    () => adapter.write_optimized_source_data_files(),
    { message: `Source data optimization backup already exists: ${backup_path}` },
  );

  t.false(operations.some((operation) => operation.includes('.optimize.tmp')));
});

test('Finish optimization does not reload when a rename fails and leaves files for manual restoration', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
  } = create_adapter();
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', [1, 2]);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);
  const source = create_source(collection, {
    should_embed: true,
    read_hash: 'source-hash',
    data: {
      blocks_data: {},
      embedding: create_embedding_data(0, 'source-hash'),
    },
  });
  source.source_adapter = { should_persist: true };

  const source_vector_path = collection.embeddings.get_file_path();
  const block_vector_path = block_collection.embeddings.get_file_path();
  files.set(source_vector_path, new Float32Array([1, 2]).buffer);
  files.set(block_vector_path, new ArrayBuffer(0));
  files.set(adapter.get_ajson_file_path(0), 'old base');

  const plan = await adapter.write_optimized_source_data_files();
  const failed_temp_path = plan.new_source_files[0].temporary_path;
  const original_rename = fs.adapter.rename.bind(fs.adapter);
  fs.adapter.rename = async (old_path, new_path) => {
    if (old_path === failed_temp_path) throw new Error('rename failed');
    return await original_rename(old_path, new_path);
  };
  let reload_count = 0;
  const previous_window = globalThis.window;
  globalThis.window = {
    location: {
      reload() { reload_count += 1; },
    },
  };

  try {
    await t.throwsAsync(
      () => adapter.finish_source_data_optimization(plan),
      { message: 'rename failed' },
    );
  } finally {
    if (previous_window === undefined) delete globalThis.window;
    else globalThis.window = previous_window;
  }

  t.is(reload_count, 0);
  t.true(files.has(`${source_vector_path}.backup`));
  t.true(files.has(`${block_vector_path}.backup`));
  t.true(files.has(`${adapter.get_ajson_file_path(0)}.backup`));
  t.true(files.has(failed_temp_path));
  t.false(files.has(adapter.get_ajson_file_path(0)));
});

test('Source Data Optimize writes size-bounded temporary AJSON shards', async (t) => {
  const {
    adapter,
    block_collection,
    collection,
    files,
    fs,
  } = create_adapter({ max_bytes_per_shard: 220 });
  collection.embeddings = create_optimization_embeddings(fs, 'smart_sources', []);
  block_collection.embeddings = create_optimization_embeddings(fs, 'smart_blocks', []);

  for (const name of ['A', 'B', 'C']) {
    create_source(collection, {
      key: `Notes/${name}.md`,
      data: {
        blocks_data: {},
        payload: 'x'.repeat(120),
      },
    });
  }

  const plan = await adapter.write_optimized_source_data_files();
  const optimized = parse_optimized_sources(plan, files);

  t.is(plan.new_source_files.length, 3);
  t.deepEqual(Object.keys(optimized).sort(), [
    'Notes/A.md',
    'Notes/B.md',
    'Notes/C.md',
  ]);
  plan.new_source_files.forEach((file) => {
    t.true(file.expected_bytes <= adapter.max_bytes_per_shard);
  });
});

test('Source Data Optimize rejects unresolved block selection and legacy refs', async (t) => {
  const first = create_adapter();
  first.collection.embeddings = create_optimization_embeddings(first.fs, 'smart_sources', []);
  first.block_collection.embeddings = create_optimization_embeddings(first.fs, 'smart_blocks', []);
  create_source(first.collection, {
    key: 'Notes/Reimport.md',
    data: {
      blocks_data: {},
      block_embedding_selection: {
        requires_reimport: true,
      },
    },
  });

  await t.throwsAsync(
    () => first.adapter.write_optimized_source_data_files(),
    { message: 'Cannot optimize source data while Notes/Reimport.md requires re-import.' },
  );

  const second = create_adapter();
  second.collection.embeddings = create_optimization_embeddings(second.fs, 'smart_sources', []);
  second.block_collection.embeddings = create_optimization_embeddings(second.fs, 'smart_blocks', []);
  create_source(second.collection, {
    key: 'Notes/Legacy.md',
    data: {
      blocks_data: {},
      embedding: {
        default: {
          file: 'mf_test',
          file_i: 0,
          read_hash: 'legacy',
          at: 1,
        },
        history: [],
      },
    },
  });

  await t.throwsAsync(
    () => second.adapter.write_optimized_source_data_files(),
    { message: 'Cannot optimize source data with legacy embedding refs: Notes/Legacy.md' },
  );
});
