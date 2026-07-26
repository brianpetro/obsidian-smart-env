import test from 'ava';
import { Embeddings } from './embeddings.js';

const default_dims = 3;
const default_vector = [1, 2, 3];

function create_embeddings(params = {}) {
  const dims = params.dims ?? default_dims;
  const model_results = Object.prototype.hasOwnProperty.call(params, 'model_results')
    ? params.model_results
    : [{ vec: default_vector }]
  ;
  const events = [];
  const env = {
    events: {
      emit(event_key, event = {}) {
        events.push({ event_key, event });
      },
    },
    embedding_models: {
      default: {
        data: {
          provider_key: 'test',
          model_key: 'test-embedding-model',
          dims,
          max_tokens: 512,
        },
      },
    },
  };
  const collection = {
    collection_key: 'smart_sources',
    data_dir: 'smart_sources',
    data_fs: {},
    env,
    embed_model_key: 'test-embedding-model',
    embed_model: {
      is_loaded: true,
      batch_size: 10,
      async embed_batch() {
        return typeof model_results === 'function'
          ? await model_results()
          : model_results
        ;
      },
    },
    emit_event(event_key, event = {}) {
      events.push({ event_key, event });
    },
    mark_embed_queue_dirty() {
      this.embed_queue_dirty = true;
    },
    async process_save_queue() {
      this.save_queue_processed = true;
    },
  };
  const embeddings = new Embeddings(collection);
  collection.embeddings = embeddings;
  embeddings.defer_vector_saves = true;

  const file = embeddings.active_file;
  set_vector_file(embeddings, file, params.vectors || [], dims);

  return {
    collection,
    embeddings,
    events,
    file,
  };
}

function create_item(collection, params = {}) {
  const read_hash = params.read_hash ?? 'current-hash';
  const embedding = {
    history: [],
  };
  if (params.ref) embedding.default = { ...params.ref };

  return {
    key: params.key || 'Notes/Test.md',
    read_hash,
    data: { embedding },
    collection,
    collection_key: collection.collection_key,
    _queue_embed: true,
    _embed_input: null,
    async get_embed_input() {
      return params.embed_input ?? 'test input';
    },
    queue_save() {
      this.save_queued = true;
    },
  };
}

function set_vector_file(embeddings, file, values, dims = default_dims) {
  const vectors = values instanceof Float32Array
    ? values
    : new Float32Array(values)
  ;
  embeddings._vectors_by_file[file] = vectors;
  embeddings._dims_by_file[file] = dims;
  embeddings._vector_lengths_by_file[file] = vectors.length;
  embeddings._persisted_lengths_by_file[file] = vectors.length;
}

function create_ref(file, params = {}) {
  return {
    file,
    file_i: params.file_i ?? 0,
    read_hash: params.read_hash ?? 'current-hash',
    at: 1,
  };
}

test('get_item_vector returns a matching current vector', (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  const item = create_item(collection, {
    ref: create_ref(file),
  });

  t.deepEqual(
    Array.from(embeddings.get_item_vector(item)),
    default_vector,
  );
});

test('get_item_vector rejects a stale read_hash', (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  const item = create_item(collection, {
    ref: create_ref(file, { read_hash: 'stale-hash' }),
  });

  t.is(embeddings.get_item_vector(item), undefined);
});

test('get_item_vector rejects an empty read_hash', (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  const item = create_item(collection, {
    ref: create_ref(file, { read_hash: '' }),
  });

  t.is(embeddings.get_item_vector(item), undefined);
});

test('get_item_vector rejects an out-of-range file_i', (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  const item = create_item(collection, {
    ref: create_ref(file, { file_i: 1 }),
  });

  t.is(embeddings.get_item_vector(item), undefined);
});

test('has_current_vector_ref rejects a negative file_i', (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  const item = create_item(collection, {
    ref: create_ref(file, { file_i: -1 }),
  });

  t.false(embeddings.has_current_vector_ref(item));
  t.is(embeddings.get_item_vector(item), undefined);
});

test('load_vectors fails closed on unreadable or malformed existing files', async (t) => {
  const cases = [
    {
      read_result: { error: 'EIO' },
      message: /Failed to read vector file .*: EIO/,
    },
    {
      read_result: new Uint8Array([1, 2, 3]).buffer,
      message: /Invalid vector file .*byte length 3 is not divisible by 4/,
    },
  ];

  for (const test_case of cases) {
    const { collection, embeddings, file } = create_embeddings();
    const path = embeddings.get_file_path(file);
    collection.data_fs = {
      async exists(target_path) {
        return target_path === path;
      },
      async read_binary() {
        return test_case.read_result;
      },
    };
    embeddings._vectors_by_file = {};
    embeddings._dims_by_file = {};
    embeddings._vector_lengths_by_file = {};
    embeddings._persisted_lengths_by_file = {};

    await t.throwsAsync(
      () => embeddings.load_vectors(file),
      { message: test_case.message },
    );

    t.false(Object.prototype.hasOwnProperty.call(embeddings._vectors_by_file, file));
    t.false(Object.prototype.hasOwnProperty.call(embeddings._vector_lengths_by_file, file));
    t.false(Object.prototype.hasOwnProperty.call(embeddings._persisted_lengths_by_file, file));
  }
});

test('set_item_vector null clears a source ref without changing vector bytes', (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  const item = create_item(collection, {
    ref: create_ref(file),
  });
  item._queue_embed = false;
  item._embed_input = 'cached input';
  const vectors = embeddings._vectors_by_file[file];

  embeddings.set_item_vector(item, null);

  t.is(item.data.embedding.default, undefined);
  t.deepEqual(item.data.embedding.history, []);
  t.true(item.save_queued);
  t.true(collection.embed_queue_dirty);
  t.false(item._queue_embed);
  t.is(item._embed_input, null);
  t.is(embeddings._vectors_by_file[file], vectors);
  t.deepEqual(Array.from(vectors), default_vector);
  t.false(embeddings._dirty_files.has(file));
});

test('set_item_vector null queues block persistence through its parent source', (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  const source_collection = {
    mark_embed_queue_dirty() {
      this.embed_queue_dirty = true;
    },
  };
  const source = {
    queue_save() {
      this.save_queued = true;
    },
  };
  const block = create_item(collection, {
    key: 'Notes/Test.md#Heading',
    ref: create_ref(file),
  });
  block.source_collection = source_collection;
  block.queue_save = () => source.queue_save();
  block._queue_embed = false;

  embeddings.set_item_vector(block, null);

  t.is(block.data.embedding.default, undefined);
  t.true(source.save_queued);
  t.true(collection.embed_queue_dirty);
  t.true(source_collection.embed_queue_dirty);
  t.false(block._queue_embed);
  t.deepEqual(Array.from(embeddings._vectors_by_file[file]), default_vector);
  t.false(embeddings._dirty_files.has(file));
});

test('embed_batch validates all responses before updating embedding refs', async (t) => {
  const invalid_cases = [
    {
      name: 'invalid batch response',
      model_results: null,
      message: /invalid batch response/,
    },
    {
      name: 'missing result',
      model_results: [],
      message: /returned 0 results for 1 items/,
    },
    {
      name: 'provider error',
      model_results: [{ error: 'provider failed', vec: default_vector }],
      message: /provider failed/,
    },
    {
      name: 'missing vector',
      model_results: [{}],
      message: /is missing a vector/,
    },
    {
      name: 'wrong dimensions',
      model_results: [{ vec: [1, 2] }],
      message: /has 2 dimensions; expected 3/,
    },
    {
      name: 'non-finite values',
      model_results: [{ vec: [1, Number.NaN, 3] }],
      message: /contains non-finite values/,
    },
    {
      name: 'zero magnitude',
      model_results: [{ vec: [0, 0, 0] }],
      message: /has zero magnitude/,
    },
  ];

  for (const invalid_case of invalid_cases) {
    const { collection, embeddings, file } = create_embeddings({
      model_results: invalid_case.model_results,
    });
    const previous_ref = create_ref('mf_previous', {
      file_i: 4,
      read_hash: 'previous-hash',
    });
    const item = create_item(collection, {
      ref: previous_ref,
    });

    await t.throwsAsync(
      () => embeddings.embed_batch([item]),
      { message: invalid_case.message },
      invalid_case.name,
    );

    t.deepEqual(
      item.data.embedding.default,
      previous_ref,
      `${invalid_case.name}: previous ref remains unchanged`,
    );
    t.true(
      item._queue_embed,
      `${invalid_case.name}: item remains queued`,
    );
    t.is(
      embeddings._dirty_files.size,
      0,
      `${invalid_case.name}: no vector file is dirtied`,
    );
    t.is(
      embeddings.get_vector_value_count(file),
      0,
      `${invalid_case.name}: no row is appended`,
    );
  }
});

test('embed_batch validates later responses before storing earlier vectors', async (t) => {
  const { collection, embeddings, file } = create_embeddings({
    model_results: [
      { vec: default_vector },
      { vec: [1, 2] },
    ],
  });
  const first_item = create_item(collection, { key: 'Notes/First.md' });
  const second_item = create_item(collection, { key: 'Notes/Second.md' });

  await t.throwsAsync(
    () => embeddings.embed_batch([first_item, second_item]),
    { message: /has 2 dimensions; expected 3/ },
  );

  t.is(first_item.data.embedding.default, undefined);
  t.is(second_item.data.embedding.default, undefined);
  t.is(embeddings._dirty_files.size, 0);
  t.is(embeddings.get_vector_value_count(file), 0);
});

test('embed_batch rejects an item without a read_hash', async (t) => {
  const { collection, embeddings } = create_embeddings();
  const item = create_item(collection, { read_hash: '' });

  await t.throwsAsync(
    () => embeddings.embed_batch([item]),
    { message: /Missing read_hash/ },
  );

  t.is(item.data.embedding.default, undefined);
  t.true(item._queue_embed);
  t.true(item.save_queued);
});

test('embed_batch stores a fully valid response', async (t) => {
  const { collection, embeddings } = create_embeddings();
  const item = create_item(collection);

  const results = await embeddings.embed_batch([item]);

  t.is(results.length, 1);
  t.is(item.data.embedding.default.read_hash, item.read_hash);
  t.deepEqual(
    Array.from(embeddings.get_item_vector(item)),
    default_vector,
  );
});

test('embed_batch replaces an invalid current file_i with a new row', async (t) => {
  const replacement_vector = [3, 2, 1];
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
    model_results: [{ vec: replacement_vector }],
  });
  const item = create_item(collection, {
    ref: create_ref(file, { file_i: 4 }),
  });

  await embeddings.embed_batch([item]);

  t.is(item.data.embedding.default.file_i, 1);
  t.deepEqual(Array.from(embeddings.get_item_vector(item)), replacement_vector);
  t.is(item.data.embedding.history.length, 1);
  t.is(item.data.embedding.history[0].file_i, 4);
});

test('embed_batch throws when a validated vector cannot be stored', async (t) => {
  const { collection, embeddings } = create_embeddings();
  const item = create_item(collection);
  embeddings.set_item_vector = () => null;

  await t.throwsAsync(
    () => embeddings.embed_batch([item]),
    { message: /Failed to store embedding vector/ },
  );

  t.is(item.data.embedding.default, undefined);
  t.true(item._queue_embed);
  t.true(item.save_queued);
  t.regex(item.data.embedding.error, /Failed to store embedding vector/);
});

test('process_embed_queue does not mark invalid or missing responses successfully embedded', async (t) => {
  const invalid_cases = [
    {
      name: 'wrong dimensions',
      model_results: [{ vec: [1, 2] }],
      item_params: {},
    },
    {
      name: 'missing embedding input',
      model_results: [{ vec: default_vector }],
      item_params: { embed_input: '' },
    },
  ];

  for (const invalid_case of invalid_cases) {
    const { collection, embeddings, events } = create_embeddings({
      model_results: invalid_case.model_results,
    });
    const item = create_item(collection, invalid_case.item_params);
    let embed_hash_set_count = 0;

    Object.defineProperty(item, 'embed_hash', {
      configurable: true,
      get() {
        return this.data.embedding.default?.read_hash;
      },
      set(read_hash) {
        embed_hash_set_count += 1;
        if (this.data.embedding.default) {
          this.data.embedding.default.read_hash = read_hash;
        }
      },
    });

    collection._test_embed_queue = [item];
    Object.defineProperty(collection, 'embed_queue', {
      configurable: true,
      get() {
        return this._test_embed_queue;
      },
    });

    await embeddings.entities_vector_adapter.process_embed_queue();

    t.is(
      embed_hash_set_count,
      0,
      `${invalid_case.name}: embed_hash setter is not called`,
    );
    t.is(
      item.data.embedding.default,
      undefined,
      `${invalid_case.name}: no embedding ref is created`,
    );
    t.true(
      item._queue_embed,
      `${invalid_case.name}: item remains queued`,
    );
    t.true(
      events.some(({ event_key }) => event_key === 'embedding:error'),
      `${invalid_case.name}: embedding error is emitted`,
    );
    t.is(
      events.some(({ event_key }) => event_key === 'items:embedded'),
      false,
      `${invalid_case.name}: embedded event is not emitted`,
    );
  }
});


test('embed adapter checkpoints vector files before item refs after 1000 stored embeddings', async (t) => {
  const { collection, embeddings } = create_embeddings();
  const adapter = embeddings.entities_vector_adapter;
  const calls = [];

  collection._defer_embed_saves = true;
  adapter._stored_since_checkpoint = 1000;
  embeddings.save_dirty_files = async () => {
    calls.push('vectors');
  };
  collection.process_save_queue = async () => {
    t.false(collection._defer_embed_saves);
    calls.push('refs');
  };

  await adapter.embed_batch([create_item(collection)]);

  t.deepEqual(calls, ['vectors', 'refs']);
  t.true(collection._defer_embed_saves);
  t.is(adapter._stored_since_checkpoint, 1);
});

test('embed adapter preserves result order across embedding managers', async (t) => {
  const { embeddings } = create_embeddings();
  const adapter = embeddings.entities_vector_adapter;
  const source_embeddings = {
    async embed_batch(items) {
      return items.map((item) => ({ key: `source:${item.key}` }));
    },
  };
  const block_embeddings = {
    async embed_batch(items) {
      return items.map((item, item_i) => ({
        key: `block:${item.key}`,
        skipped: item_i === 1,
      }));
    },
  };
  const items = [
    { key: 'source-1', collection: { embeddings: source_embeddings } },
    { key: 'block-1', collection: { embeddings: block_embeddings } },
    { key: 'source-2', collection: { embeddings: source_embeddings } },
    { key: 'block-2', collection: { embeddings: block_embeddings } },
  ];

  const results = await adapter.embed_batch(items);

  t.deepEqual(
    results.map((result) => result.key),
    ['source:source-1', 'block:block-1', 'source:source-2', 'block:block-2'],
  );
  t.is(adapter._stored_since_checkpoint, 3);
});

test('reserve_vector_capacity grows once and preserves active vectors', async (t) => {
  const { embeddings, file } = create_embeddings({
    vectors: default_vector,
  });

  const reserved_vectors = await embeddings.reserve_vector_capacity(5, file);

  t.true(reserved_vectors.length >= 18);
  t.deepEqual(Array.from(reserved_vectors.subarray(0, 3)), default_vector);
  t.is(embeddings.get_vector_value_count(file), 3);

  for (let row_i = 0; row_i < 5; row_i += 1) {
    const file_i = embeddings.append_vector(file, default_dims);
    t.true(embeddings.set_vector(file, file_i, default_vector));
  }

  t.is(embeddings._vectors_by_file[file], reserved_vectors);
  t.is(embeddings.get_vector_value_count(file), 18);
});

test('process_embed_queue loads existing vectors before reserving new rows', async (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  const current_item = create_item(collection, {
    key: 'Notes/Current.md',
    ref: create_ref(file),
  });
  const new_item = create_item(collection, {
    key: 'Notes/New.md',
  });
  collection.embed_queue = [current_item, new_item];
  collection.data_fs = {
    async exists(path) {
      return path === embeddings.get_file_path(file);
    },
    async read_binary() {
      return new Float32Array(default_vector).buffer;
    },
  };
  embeddings._vectors_by_file = {};
  embeddings._dims_by_file = {};
  embeddings._vector_lengths_by_file = {};
  embeddings._persisted_lengths_by_file = {};

  let reserved_rows = 0;
  const reserve_vector_capacity = embeddings.reserve_vector_capacity.bind(embeddings);
  embeddings.reserve_vector_capacity = async (expected_new_rows, target_file) => {
    reserved_rows = expected_new_rows;
    return await reserve_vector_capacity(expected_new_rows, target_file);
  };

  const adapter = embeddings.entities_vector_adapter;
  adapter._is_processing_embed_queue = true;
  await adapter.process_embed_queue();

  t.is(reserved_rows, 1);
  t.is(embeddings.get_vector_value_count(file), default_vector.length);
  t.true(embeddings._vectors_by_file[file].length >= default_vector.length * 2);
});

test('process_embed_queue restores all defer flags before final vector saves', async (t) => {
  const { collection, embeddings, file } = create_embeddings({
    vectors: default_vector,
  });
  collection.embed_queue = [create_item(collection, {
    ref: create_ref(file),
  })];
  collection._defer_embed_saves = false;

  const block_embeddings = {
    defer_vector_saves: false,
    clear_save_timeout() {},
    async save_dirty_files() {},
  };
  const block_collection = {
    collection_key: 'smart_blocks',
    _defer_embed_saves: false,
    embeddings: block_embeddings,
    async process_save_queue() {},
  };
  collection.block_collection = block_collection;

  embeddings.save_dirty_files = async () => {
    t.false(collection._defer_embed_saves);
    t.false(block_collection._defer_embed_saves);
    t.true(embeddings.defer_vector_saves);
    t.false(block_embeddings.defer_vector_saves);
    throw new Error('vector save failed');
  };

  const adapter = embeddings.entities_vector_adapter;
  adapter._is_processing_embed_queue = true;

  await t.throwsAsync(
    () => adapter.process_embed_queue(),
    { message: /vector save failed/ },
  );

  t.false(collection._defer_embed_saves);
  t.false(block_collection._defer_embed_saves);
  t.true(embeddings.defer_vector_saves);
  t.false(block_embeddings.defer_vector_saves);
});

test('V2 similarity resolves external file_i rows without a WASM index', async (t) => {
  const { collection, embeddings, file } = create_embeddings({
    dims: 2,
    vectors: [
      1, 0,
      0, 1,
    ],
  });
  const first = create_item(collection, {
    key: 'Notes/First.md',
    ref: create_ref(file, { file_i: 0 }),
  });
  const second = create_item(collection, {
    key: 'Notes/Second.md',
    ref: create_ref(file, { file_i: 1 }),
  });
  Object.defineProperty(first, 'vec', {
    get() {
      return embeddings.get_item_vector(this);
    },
  });
  Object.defineProperty(second, 'vec', {
    get() {
      return embeddings.get_item_vector(this);
    },
  });
  collection.filter = () => [first, second];

  const results = await embeddings.entities_vector_adapter.nearest(
    new Float32Array([1, 0]),
    { limit: 2 },
  );

  t.deepEqual(results.map((result) => result.item.key), [first.key, second.key]);
  t.deepEqual(Array.from(first.vec), [1, 0]);
  t.false(Object.prototype.hasOwnProperty.call(collection, 'vec_index'));
  t.false(Object.prototype.hasOwnProperty.call(first, 'vec_i'));
});
