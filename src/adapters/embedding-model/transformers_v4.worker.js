// Force Transformers.js to select ONNX Runtime Web in Electron workers.
globalThis.process = undefined;

const transformers_v4_url = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

const retryable_webgpu_error_patterns = [
  /\bWEBGPU_RETRYABLE_ERROR\b/i,
  /no available backend found/i,
  /webgpuinit is not a function/i,
  /subgroupminsize/i,
];

function get_error_message(error) {
  return error?.message || String(error || 'Unknown error');
}

function is_retryable_webgpu_error(error) {
  const error_message = get_error_message(error);
  return retryable_webgpu_error_patterns.some((pattern) => pattern.test(error_message));
}

async function is_webgpu_available() {
  if (!globalThis.navigator?.gpu) return false;
  try {
    return Boolean(await navigator.gpu.requestAdapter());
  } catch (_error) {
    return false;
  }
}

function copy_vector(data) {
  return data instanceof Float32Array
    ? new Float32Array(data)
    : Float32Array.from(data || [])
  ;
}

const default_semantic_profile = {
  pooling: 'mean',
  normalize: true,
  query_prefix: '',
  document_prefix: '',
};

class TransformersWorkerModel {
  constructor(params = {}) {
    const configured_batch_size = Number(params.batch_size);
    this.model_key = params.model_key;
    this.max_tokens = Number(params.max_tokens) || 512;
    this.use_gpu = params.use_gpu !== false;
    this.semantic_profile = {
      ...default_semantic_profile,
      ...params.semantic_profile,
    };
    this.configured_batch_size = Number.isFinite(configured_batch_size)
      && configured_batch_size > 1
      ? Math.min(16, Math.floor(configured_batch_size))
      : null
    ;
    this.dtype = params.dtype || 'auto';
    this.has_gpu = false;
    this.pipeline = null;
    this.tokenizer = null;
    this.active_config_key = null;
    this.transformers_module = null;
  }

  get gpu_enabled() {
    return this.use_gpu && this.has_gpu;
  }

  get batch_size() {
    if (this.configured_batch_size) return this.configured_batch_size;
    return this.active_config_key?.includes('webgpu') ? 16 : 8;
  }

  async load() {
    this.has_gpu = this.use_gpu
      ? await is_webgpu_available()
      : false
    ;
    await this.dispose_pipeline();

    if (this.gpu_enabled) {
      try {
        await this.load_pipeline('webgpu');
        return;
      } catch (error) {
        console.warn('[Transformers worker] WebGPU load failed, falling back to WASM', error);
        this.use_gpu = false;
        this.has_gpu = false;
        await this.dispose_pipeline();
      }
    }

    await this.load_pipeline('wasm');
  }

  async get_transformers_module() {
    if (!this.transformers_module) {
      const started_at = Date.now();
      console.log('[Transformers worker] load: CDN v4 runtime starting');
      this.transformers_module = await import(transformers_v4_url);
      const { env, LogLevel } = this.transformers_module;
      env.allowLocalModels = false;
      if (typeof env.useBrowserCache !== 'undefined') {
        env.useBrowserCache = true;
      }
      if (LogLevel) env.logLevel = LogLevel.ERROR;
      console.log(
        `[Transformers worker] load: CDN v4 runtime ready (${Date.now() - started_at} ms)`,
      );
    }
    return this.transformers_module;
  }

  async load_pipeline(device) {
    const { pipeline } = await this.get_transformers_module();
    const config_key = `${device}_${this.dtype}`;
    const started_at = Date.now();

    console.log(`[Transformers worker] load: ONNX v4/${config_key} starting`);
    this.pipeline = await pipeline('feature-extraction', this.model_key, {
      device,
      dtype: this.dtype,
    });
    this.tokenizer = this.pipeline.tokenizer;
    if (!this.tokenizer) {
      throw new Error('Transformers v4 pipeline tokenizer unavailable');
    }
    this.active_config_key = config_key;
    console.log(
      `[Transformers worker] load: ONNX v4/${config_key} ready (${Date.now() - started_at} ms)`,
    );
  }

  async load_wasm_pipeline() {
    this.use_gpu = false;
    this.has_gpu = false;
    await this.dispose_pipeline();
    await this.load_pipeline('wasm');
  }

  async reload_pipeline() {
    await this.load();
  }

  async dispose_pipeline() {
    const pipeline = this.pipeline;
    this.pipeline = null;
    this.tokenizer = null;
    this.active_config_key = null;
    if (!pipeline) return;

    try {
      if (typeof pipeline.dispose === 'function') {
        await pipeline.dispose();
      } else if (typeof pipeline.destroy === 'function') {
        await pipeline.destroy();
      }
    } catch (error) {
      console.warn('[Transformers worker] failed to dispose pipeline', error);
    }
  }

  async count_tokens(input) {
    if (!this.tokenizer) await this.load();
    const { input_ids } = await this.tokenizer(input);
    return { tokens: input_ids.data.length };
  }

  async embed_batch(inputs) {
    if (!this.pipeline) await this.load();
    const filtered_inputs = inputs.filter((item) => item.embed_input?.length > 0);
    if (!filtered_inputs.length) return [];

    const results = [];
    for (let i = 0; i < filtered_inputs.length; i += this.batch_size) {
      const batch = filtered_inputs.slice(i, i + this.batch_size);
      results.push(...await this.process_batch(batch));
    }
    return results;
  }

  is_active_webgpu_error(error) {
    return this.active_config_key?.includes('webgpu')
      && is_retryable_webgpu_error(error)
    ;
  }

  async process_batch(batch_inputs) {
    let batch_error;

    try {
      return await this.embed_prepared_batch(batch_inputs);
    } catch (error) {
      batch_error = error;
    }

    if (this.is_active_webgpu_error(batch_error)) {
      console.warn('[Transformers worker] retrying batch on WASM', batch_error);
      await this.load_wasm_pipeline();
      try {
        return await this.embed_prepared_batch(batch_inputs);
      } catch (error) {
        batch_error = error;
      }
    }

    console.error('[Transformers worker] batch failed, retrying items individually', batch_error);
    let individual_results = null;
    try {
      individual_results = await this.retry_items_individually(batch_inputs);
    } catch (error) {
      if (this.is_active_webgpu_error(error)) {
        console.warn('[Transformers worker] retrying individual items on WASM', error);
        await this.load_wasm_pipeline();
        individual_results = await this.retry_items_individually(batch_inputs);
      } else {
        batch_error = error;
      }
    }

    if (individual_results?.some((result) => !result.error)) {
      return individual_results;
    }

    console.warn('[Transformers worker] individual retries failed, reloading pipeline', batch_error);
    await this.reload_pipeline();
    try {
      return await this.retry_items_individually(batch_inputs);
    } catch (error) {
      if (!this.is_active_webgpu_error(error)) throw error;
      console.warn('[Transformers worker] retrying individual items on WASM', error);
      await this.load_wasm_pipeline();
      return await this.retry_items_individually(batch_inputs);
    }
  }

  async embed_prepared_batch(batch_inputs) {
    const prepared = await Promise.all(
      batch_inputs.map((item) => this.prepare_input(item.embed_input, item.purpose)),
    );
    const embed_inputs = prepared.map((item) => item.text);
    const response = await this.pipeline(embed_inputs, {
      pooling: this.semantic_profile.pooling,
      normalize: this.semantic_profile.normalize,
    });

    return prepared.map((item, i) => ({
      vec: copy_vector(response[i].data),
      tokens: item.tokens,
    }));
  }

  async prepare_input(embed_input, purpose = 'document') {
    if (purpose !== 'query' && purpose !== 'document') {
      throw new Error(`Unsupported embedding purpose: ${purpose}`);
    }
    const prefix = purpose === 'query'
      ? this.semantic_profile.query_prefix
      : this.semantic_profile.document_prefix
    ;
    const semantic_input = `${prefix}${embed_input}`;
    let { tokens } = await this.count_tokens(semantic_input);
    if (tokens <= this.max_tokens) {
      return { text: semantic_input, tokens };
    }

    let truncated = semantic_input;
    while (tokens > this.max_tokens && truncated.length > 0) {
      const pct = this.max_tokens / tokens;
      const max_chars = Math.floor(truncated.length * pct * 0.9);
      truncated = truncated.slice(0, max_chars);
      const last_space = truncated.lastIndexOf(' ');
      if (last_space > 0) truncated = truncated.slice(0, last_space);
      tokens = (await this.count_tokens(truncated)).tokens;
    }
    return { text: truncated, tokens };
  }

  async retry_items_individually(batch_inputs) {
    const results = [];

    for (const item of batch_inputs) {
      try {
        const prepared = await this.prepare_input(item.embed_input, item.purpose);
        const response = await this.pipeline(prepared.text, {
          pooling: this.semantic_profile.pooling,
          normalize: this.semantic_profile.normalize,
        });
        results.push({
          vec: copy_vector(response[0].data),
          tokens: prepared.tokens,
        });
      } catch (error) {
        if (this.is_active_webgpu_error(error)) throw error;
        console.error('[Transformers worker] single item failed', error);
        results.push({
          vec: [],
          tokens: 0,
          error: get_error_message(error),
        });
      }
    }

    return results;
  }
}

let model = null;
let request_queue = Promise.resolve();

function get_transfer_list(result) {
  if (!Array.isArray(result)) return [];
  return result
    .map((item) => item?.vec)
    .filter((vec) => vec instanceof Float32Array)
    .map((vec) => vec.buffer)
  ;
}

async function process_message(data = {}) {
  const { method, params = {}, id } = data;

  try {
    let result;
    switch (method) {
      case 'load':
        if (model) await model.dispose_pipeline();
        model = new TransformersWorkerModel(params);
        await model.load();
        result = {
          model_loaded: true,
          model_config_key: model.active_config_key,
        };
        break;
      case 'embed_batch':
        if (!model) throw new Error('Model not loaded');
        result = await model.embed_batch(params.inputs || []);
        break;
      case 'count_tokens':
        if (!model) throw new Error('Model not loaded');
        result = await model.count_tokens(params.input);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    self.postMessage({
      id,
      result,
      model_config_key: model?.active_config_key || null,
    }, get_transfer_list(result));
  } catch (error) {
    console.error('[Transformers worker] request failed', error);
    self.postMessage({
      id,
      error: get_error_message(error),
      model_config_key: model?.active_config_key || null,
    });
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  request_queue = request_queue
    .then(() => process_message(data))
    .catch((error) => {
      console.error('[Transformers worker] request queue failed', error);
    })
  ;
});
