import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'ava';
import { SmartEmbedMessageAdapter } from 'smart-embed-model/adapters/_message.js';
import { SmartEntities } from 'smart-entities/smart_entities.js';
import { pre_process } from '../../actions/lookup-list/pre_process.js';

let WorkerModel;
let worker_source;

test.before(async () => {
  worker_source = await fs.readFile(
    new URL('./transformers_v4.worker.js', import.meta.url),
    'utf8',
  );
  const context = vm.createContext({
    console: {
      error() {},
      log() {},
      warn() {},
    },
    navigator: {
      gpu: {
        async requestAdapter() {
          return {};
        },
      },
    },
    self: {
      addEventListener() {},
      postMessage() {},
    },
  });

  vm.runInContext(
    `${worker_source}\nglobalThis.__worker_model = TransformersWorkerModel;`,
    context,
  );
  WorkerModel = context.__worker_model;
});

function create_model(semantic_profile) {
  const model = new WorkerModel({
    model_key: 'test/model',
    max_tokens: 512,
    semantic_profile,
    use_gpu: false,
  });
  model.active_config_key = 'wasm_auto';
  model.tokenizer = async (input) => ({
    input_ids: {
      data: new Array(input.length).fill(0),
    },
  });
  return model;
}

test('one configured dtype is used for WebGPU and WASM', async (t) => {
  const model = create_model();
  const pipeline_options = [];
  const tokenizer = model.tokenizer;
  model.get_transformers_module = async () => ({
    async pipeline(_task, _model_key, options) {
      pipeline_options.push(options);
      const pipeline = async () => [];
      pipeline.tokenizer = tokenizer;
      pipeline.dispose = async () => {};
      return pipeline;
    },
  });

  await model.load_pipeline('webgpu');
  await model.dispose_pipeline();
  await model.load_pipeline('wasm');

  t.deepEqual(JSON.parse(JSON.stringify(pipeline_options)), [
    { device: 'webgpu', dtype: 'auto' },
    { device: 'wasm', dtype: 'auto' },
  ]);
});

test('WebGPU load failure falls back once to v4 WASM', async (t) => {
  const model = new WorkerModel({
    model_key: 'test/model',
    dtype: 'auto',
    use_gpu: true,
  });
  const attempts = [];
  model.load_pipeline = async (device) => {
    attempts.push({ device, dtype: model.dtype });
    if (device === 'webgpu') throw new Error('WebGPU failed');
    model.active_config_key = `${device}_${model.dtype}`;
  };

  await model.load();

  t.deepEqual(attempts, [
    { device: 'webgpu', dtype: 'auto' },
    { device: 'wasm', dtype: 'auto' },
  ]);
  t.is(model.active_config_key, 'wasm_auto');
  t.false(model.use_gpu);
});

test('worker contains no v3 runtime or dtype probing path', (t) => {
  t.false(worker_source.includes('transformers_v3_url'));
  t.false(worker_source.includes('load_v3_pipeline'));
  t.false(worker_source.includes('ModelRegistry'));
  t.false(worker_source.includes('available_dtypes'));
  t.false(worker_source.includes('retryable_webgpu_error_patterns'));
  t.false(worker_source.includes('reload_pipeline'));
});

test('embed batch preserves cardinality when the backend batch size changes', async (t) => {
  const model = create_model();
  const processed_inputs = [];
  model.pipeline = async () => [];
  model.active_config_key = 'webgpu_auto';
  model.process_batch = async (batch) => {
    processed_inputs.push(Array.from(batch, (item) => item.embed_input));
    model.active_config_key = 'wasm_auto';
    return Array.from(batch, (item) => ({
      vec: new Float32Array([1, 2, 3]),
      tokens: Number(item.embed_input),
    }));
  };

  const inputs = Array.from({ length: 20 }, (_value, input_i) => ({
    embed_input: String(input_i + 1),
  }));
  const results = await model.embed_batch(inputs);

  t.deepEqual(processed_inputs, [
    inputs.slice(0, 16).map((item) => item.embed_input),
    inputs.slice(16).map((item) => item.embed_input),
  ]);
  t.deepEqual(
    Array.from(results, (result) => result.tokens),
    inputs.map((item) => Number(item.embed_input)),
  );
});

test('embed batch returns one positional result for empty inputs', async (t) => {
  const model = create_model();
  const processed_inputs = [];
  model.pipeline = async () => [];
  model.process_batch = async (batch) => {
    processed_inputs.push(...Array.from(batch, (item) => item.embed_input));
    return Array.from(batch, (item) => ({
      vec: new Float32Array([1, 2, 3]),
      tokens: item.embed_input.length,
    }));
  };

  const results = await model.embed_batch([
    { embed_input: 'first' },
    { embed_input: '' },
    { embed_input: 'third' },
  ]);

  t.deepEqual(processed_inputs, ['first', 'third']);
  t.is(results.length, 3);
  t.is(results[0].tokens, 5);
  t.deepEqual(Array.from(results[1].vec), []);
  t.is(results[1].tokens, 0);
  t.is(results[1].error, 'Embedding input is empty');
  t.is(results[2].tokens, 5);
});

test('embed batch rejects an internal result cardinality mismatch', async (t) => {
  const model = create_model();
  model.pipeline = async () => [];
  model.process_batch = async () => [];

  const error = await t.throwsAsync(
    () => model.embed_batch([{ embed_input: 'first' }]),
  );

  t.is(error.message, 'Embedding batch returned 0 results for 1 inputs');
});

test('WebGPU inference recovery transitions to WASM only once', async (t) => {
  const model = create_model();
  const batch_attempts = [];
  let wasm_loads = 0;
  let individual_attempts = 0;
  model.active_config_key = 'webgpu_auto';
  model.use_gpu = true;
  model.has_gpu = true;
  model.embed_prepared_batch = async () => {
    batch_attempts.push(model.active_config_key);
    throw new Error(
      model.active_config_key.includes('webgpu')
        ? 'GPU device lost'
        : 'WASM batch failed',
    );
  };
  model.load_wasm_pipeline = async () => {
    wasm_loads += 1;
    model.use_gpu = false;
    model.has_gpu = false;
    model.pipeline = async () => [];
    model.active_config_key = 'wasm_auto';
  };
  model.retry_items_individually = async (batch) => {
    individual_attempts += 1;
    return Array.from(batch, () => ({
      vec: new Float32Array([1, 2, 3]),
      tokens: 1,
    }));
  };

  const batch = [{ embed_input: 'first' }];
  await model.process_batch(batch);
  await model.process_batch(batch);

  t.deepEqual(batch_attempts, ['webgpu_auto', 'wasm_auto', 'wasm_auto']);
  t.is(wasm_loads, 1);
  t.is(individual_attempts, 2);
});

test('WebGPU recovery attempts WASM once and propagates load failure', async (t) => {
  const model = create_model();
  let wasm_loads = 0;
  model.active_config_key = 'webgpu_auto';
  model.embed_prepared_batch = async () => {
    throw new Error('GPU device lost');
  };
  model.load_wasm_pipeline = async () => {
    wasm_loads += 1;
    model.use_gpu = false;
    model.has_gpu = false;
    throw new Error('WASM load failed');
  };

  const error = await t.throwsAsync(
    () => model.process_batch([{ embed_input: 'first' }]),
  );

  t.is(error.message, 'WASM load failed');
  t.is(wasm_loads, 1);
  t.false(model.use_gpu);
});

test('default profile preserves unprefixed mean-pooling behavior', async (t) => {
  const model = create_model();
  let received_inputs;
  let received_options;
  model.pipeline = async (inputs, options) => {
    received_inputs = inputs;
    received_options = options;
    return inputs.map(() => ({ data: [1, 2, 3] }));
  };

  await model.embed_prepared_batch([
    { embed_input: 'find this', purpose: 'query' },
    { embed_input: 'stored note', purpose: 'document' },
  ]);

  t.deepEqual(Array.from(received_inputs), ['find this', 'stored note']);
  t.deepEqual(received_options, {
    pooling: 'mean',
    normalize: true,
  });
});

test('Snowflake profile applies the query instruction and CLS pooling', async (t) => {
  const model = create_model({
    pooling: 'cls',
    normalize: true,
    query_prefix: 'Represent this sentence for searching relevant passages: ',
    document_prefix: '',
  });
  let received_inputs;
  let received_options;
  model.pipeline = async (inputs, options) => {
    received_inputs = inputs;
    received_options = options;
    return inputs.map(() => ({ data: [1, 2, 3] }));
  };

  await model.embed_prepared_batch([
    { embed_input: 'find this', purpose: 'query' },
    { embed_input: 'stored note', purpose: 'document' },
  ]);

  t.deepEqual(Array.from(received_inputs), [
    'Represent this sentence for searching relevant passages: find this',
    'stored note',
  ]);
  t.deepEqual(received_options, {
    pooling: 'cls',
    normalize: true,
  });
});

test('E5 profile applies query and passage prefixes during individual retry', async (t) => {
  const model = create_model({
    pooling: 'mean',
    normalize: true,
    query_prefix: 'query: ',
    document_prefix: 'passage: ',
  });
  const received_inputs = [];
  model.pipeline = async (input) => {
    received_inputs.push(input);
    return [{ data: [1, 2, 3] }];
  };

  await model.retry_items_individually([
    { embed_input: 'find this', purpose: 'query' },
    { embed_input: 'stored note', purpose: 'document' },
  ]);

  t.deepEqual(received_inputs, [
    'query: find this',
    'passage: stored note',
  ]);
});

test('missing purpose uses document semantics before token counting', async (t) => {
  const model = create_model({ document_prefix: 'passage: ' });
  const counted_inputs = [];
  model.tokenizer = async (input) => {
    counted_inputs.push(input);
    return {
      input_ids: {
        data: new Array(input.length).fill(0),
      },
    };
  };

  const prepared = await model.prepare_input('stored note');

  t.is(prepared.text, 'passage: stored note');
  t.deepEqual(counted_inputs, ['passage: stored note']);
});

test('unsupported purpose fails explicitly', async (t) => {
  const model = create_model();

  const error = await t.throwsAsync(
    () => model.prepare_input('stored note', 'classification'),
  );

  t.is(error.message, 'Unsupported embedding purpose: classification');
});

test('message adapter forwards purpose to the worker', async (t) => {
  class TestMessageAdapter extends SmartEmbedMessageAdapter {
    _post_message(message_data) {
      this.posted_message = message_data;
      queueMicrotask(() => {
        this._handle_message_result(message_data.id, [{
          vec: new Float32Array([1, 2, 3]),
          tokens: 2,
        }]);
      });
    }
  }

  const adapter = new TestMessageAdapter({ data: {}, settings: {} });
  await adapter.embed_batch([{
    embed_input: 'find this',
    purpose: 'query',
  }]);

  t.deepEqual(adapter.posted_message.params.inputs, [{
    embed_input: 'find this',
    purpose: 'query',
  }]);
});

test('message adapter preserves one result for every input', async (t) => {
  class TestMessageAdapter extends SmartEmbedMessageAdapter {
    _post_message(message_data) {
      this.posted_message = message_data;
      queueMicrotask(() => {
        this._handle_message_result(message_data.id, [
          { vec: new Float32Array([1]), tokens: 1 },
          { vec: [], tokens: 0, error: 'Embedding input is empty' },
          { vec: new Float32Array([3]), tokens: 1 },
        ]);
      });
    }
  }

  const inputs = [
    { embed_input: 'first' },
    { embed_input: '' },
    { embed_input: 'third' },
  ];
  const adapter = new TestMessageAdapter({ data: {}, settings: {} });
  const results = await adapter.embed_batch(inputs);

  t.deepEqual(adapter.posted_message.params.inputs, [
    { embed_input: 'first', purpose: undefined },
    { embed_input: '', purpose: undefined },
    { embed_input: 'third', purpose: undefined },
  ]);
  t.is(results.length, inputs.length);
  t.is(results[0], inputs[0]);
  t.is(results[1], inputs[1]);
  t.is(results[2], inputs[2]);
  t.is(results[1].error, 'Embedding input is empty');
});

test('message adapter rejects a worker result cardinality mismatch', async (t) => {
  class TestMessageAdapter extends SmartEmbedMessageAdapter {
    _post_message(message_data) {
      queueMicrotask(() => {
        this._handle_message_result(message_data.id, [{
          vec: new Float32Array([1]),
          tokens: 1,
        }]);
      });
    }
  }

  const adapter = new TestMessageAdapter({ data: {}, settings: {} });
  const error = await t.throwsAsync(
    () => adapter.embed_batch([
      { embed_input: 'first' },
      { embed_input: 'second' },
    ]),
  );

  t.is(error.message, 'Embedding model returned 1 results for 2 inputs.');
});

test('lookup preprocessing marks its input as a query', async (t) => {
  let received_inputs;
  const params = await pre_process.call({
    env: {
      smart_sources: {
        embed_model: {
          async embed(input) {
            received_inputs = [input];
            return { vec: [1, 2, 3] };
          },
        },
      },
    },
  }, { query: 'find this' });

  t.deepEqual(received_inputs, [{
    embed_input: 'find this',
    purpose: 'query',
  }]);
  t.deepEqual(params.to_item.vec, [1, 2, 3]);
});

test('legacy hypothetical lookup marks every input as a query', async (t) => {
  let received_inputs;
  await SmartEntities.prototype.lookup.call({
    embed_model: {
      async embed_batch(inputs) {
        received_inputs = inputs;
        return inputs.map(() => ({ vec: [1, 2, 3] }));
      },
    },
    entities_vector_adapter: {
      async nearest() {
        return [];
      },
    },
    env: {
      settings: { lookup_k: 10 },
    },
    collection_key: 'smart_sources',
  }, {
    hypotheticals: ['first query', 'second query'],
  });

  t.deepEqual(received_inputs, [
    { embed_input: 'first query', purpose: 'query' },
    { embed_input: 'second query', purpose: 'query' },
  ]);
});
