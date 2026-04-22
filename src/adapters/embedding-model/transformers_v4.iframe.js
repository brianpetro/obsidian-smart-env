import { SmartEmbedAdapter } from "smart-embed-model/adapters/_adapter.js";

/**
 * Default configuration for Transformers v4 adapter.
 * Exposes only model_key; device, quantization and threading are auto-managed.
 */
export const transformers_defaults = {
  adapter: 'transformers',
  description: 'Transformers (Local, built-in)',
  default_model: 'TaylorAI/bge-micro-v2',
  models: transformers_models,
};

export const DEVICE_CONFIGS = Object.freeze({
  webgpu: Object.freeze({
    device: 'webgpu',
    preferred_dtypes: ['fp32', 'fp16', 'q8', 'q4'],
  }),
  cpu: Object.freeze({
    preferred_dtypes: ['q8', 'q4', 'fp32', 'fp16'],
  }),
});

function build_device_configs(available_dtypes = [], params = {}) {
  const {
    use_gpu = false,
  } = params;

  const normalized_available_dtypes = new Set(
    Array.isArray(available_dtypes)
      ? available_dtypes
      : []
  );
  const configs = [];

  const push_scope_configs = (scope_key) => {
    const scope_config = DEVICE_CONFIGS[scope_key];
    if (!scope_config) return;

    scope_config.preferred_dtypes.forEach((dtype) => {
      if (normalized_available_dtypes.size && !normalized_available_dtypes.has(dtype)) return;

      configs.push({
        config_key: `${scope_key}_${dtype}`,
        ...(scope_config.device ? { device: scope_config.device } : {}),
        dtype,
      });
    });
  };

  if (use_gpu) {
    push_scope_configs('webgpu');
  }
  push_scope_configs('cpu');

  if (!configs.length) {
    if (use_gpu) {
      configs.push({
        config_key: 'webgpu_auto',
        device: 'webgpu',
      });
    }
    configs.push({
      config_key: 'cpu_auto',
    });
    return configs;
  }

  if (!configs.some(({ config_key }) => config_key === 'cpu_auto')) {
    configs.push({
      config_key: 'cpu_auto',
    });
  }

  return configs;
}

const retryable_webgpu_error_code = 'WEBGPU_RETRYABLE_ERROR';
const retryable_webgpu_error_patterns = [
  /no available backend found/i,
  /webgpuinit is not a function/i,
  /subgroupminsize/i,
];

function get_error_message(error) {
  return error?.message || String(error || '');
}

function is_retryable_webgpu_error(error) {
  const error_message = get_error_message(error);
  return retryable_webgpu_error_patterns.some((pattern) => pattern.test(error_message));
}

function create_retryable_webgpu_error(error) {
  const error_message = get_error_message(error);
  if (error_message.includes(retryable_webgpu_error_code)) {
    return error instanceof Error
      ? error
      : new Error(error_message)
    ;
  }

  const wrapped_error = new Error(`${retryable_webgpu_error_code}: ${error_message}`);
  try {
    wrapped_error.cause = error;
  } catch (_error) {}
  return wrapped_error;
}

function should_bubble_webgpu_error(active_config_key, error) {
  return String(active_config_key || '').includes('webgpu')
    && is_retryable_webgpu_error(error)
  ;
}

const is_webgpu_available = async () => {
  // API exposed?
  if (!('gpu' in navigator)) return false;

  // Try requesting an adapter
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return false;

  // Optionally check required features
  // return adapter.features.has('shader-f16');

  return true;
};


/**
 * Transformers v4 embedding adapter.
 *
 * - Tries WebGPU first, then falls back to CPU/WASM with 4 threads.
 * - Automatically truncates long inputs to model max_tokens.
 * - Batch embedding retries items individually on failure.
 */
export class SmartEmbedTransformersAdapter extends SmartEmbedAdapter {
  static defaults = transformers_defaults;
  /**
   * @param {import("../smart_embed_model.js").SmartEmbedModel} model
   */
  constructor(model) {
    super(model);
    /** @type {any|null} */
    this.pipeline = null;
    /** @type {any|null} */
    this.tokenizer = null;
    /** @type {'webgpu'|'wasm'|String|null} */
    this.active_config_key = null;
    /** @type {boolean} */
    this.has_gpu = false;
  }

  /**
   * Load the underlying transformers pipeline with WebGPU → WASM fallback.
   * @returns {Promise<void>}
   */
  async load() {
    this.has_gpu = await is_webgpu_available();
    try{
      if(this.loading) {
        console.warn('[Transformers v4] load already in progress, waiting...');
        while(this.loading) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      }else{
        this.loading = true;
        if (this.pipeline) {
          this.loaded = true;
          this.loading = false;
          return;
        }
        await this.load_transformers_with_fallback();
        this.loading = false;
        this.loaded = true;
        console.log(`[Transformers v4] model loaded using ${this.active_config_key}`, this);
      }
    }catch(e){
      this.loading = false;
      this.loaded = false;
      console.error('[Transformers v4] load failed', e);
      throw e;
    }
  }

  /**
   * Unload the pipeline and free resources.
   * @returns {Promise<void>}
   */
  async unload() {
    try {
      if (this.pipeline) {
        if (typeof this.pipeline.destroy === 'function') {
          this.pipeline.destroy();
        } else if (typeof this.pipeline.dispose === 'function') {
          this.pipeline.dispose();
        }
      }
    } catch (err) {
      console.warn('[Transformers v4] error while disposing pipeline', err);
    }
    this.pipeline = null;
    this.tokenizer = null;
    this.active_config_key = null;
    this.loaded = false;
  }

  /**
   * Available models – reuses the v1 transformers model catalog.
   * @returns {Object}
   */
  get models() {
    return transformers_models;
  }

  /**
   * Maximum tokens per input.
   * @returns {number}
   */
  get max_tokens() {
    return this.model.data.max_tokens || 512;
  }

  /**
   * Effective batch size.
   * Prefers small deterministic batches when not explicitly configured.
   * @returns {number}
   */
  get batch_size() {
    const configured = this.model.data.batch_size;
    if (configured && configured > 0) return configured;
    return this.gpu_enabled ? 16 : 8;
  }
  get gpu_enabled() {
    if (this.has_gpu) {
      const explicit = typeof this.model.data.use_gpu === 'boolean' ? this.model.data.use_gpu : null;
      if (explicit === false) return false;
      return true;
    }else{
      return false;
    }
  }

  /**
   * Initialize transformers pipeline with WebGPU → WASM fallback.
   * @private
   * @returns {Promise<void>}
   */
  async load_transformers_with_fallback() {
    const { pipeline, env, AutoTokenizer, ModelRegistry, LogLevel } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.1.0');
    env.logLevel = LogLevel.ERROR; // Reduce logging noise during loading

    let available_dtypes = [];
    try {
      available_dtypes = await ModelRegistry.get_available_dtypes(this.model_key);
      console.log({ available_dtypes });
    } catch (error) {
      console.warn('[Transformers v4] failed to probe available dtypes, falling back to runtime defaults', error);
    }

    env.allowLocalModels = false;
    if (typeof env.useBrowserCache !== 'undefined') {
      env.useBrowserCache = true;
    }

    let last_error = null;

    const config_list = build_device_configs(available_dtypes, {
      use_gpu: this.gpu_enabled,
    });
    const try_create = async (device_config) => {
      const pipeline_params = {};
      if (device_config.device) {
        pipeline_params.device = device_config.device;
      }
      if (device_config.dtype) {
        pipeline_params.dtype = device_config.dtype;
      }

      const pipe = await pipeline('feature-extraction', this.model_key, pipeline_params);
      return pipe;
    };

    for (const device_config of config_list) {
      const config_key = device_config.config_key;
      if (this.pipeline) break;
      try {
        console.log(`[Transformers v4] trying to load pipeline on ${config_key}`);
        // if(this.gpu_enabled) throw new Error('Simulated GPU load failure for testing fallback (no available backend found)'); // TESTING
        this.pipeline = await try_create(device_config);
        this.active_config_key = config_key;
        break;
      } catch (err) {
        console.warn(`[Transformers v4: ${config_key}] failed to load pipeline on ${config_key}`, err);
        if (device_config.device === 'webgpu' && is_retryable_webgpu_error(err)) {
          throw create_retryable_webgpu_error(err);
        }
        last_error = err;
      }
    }
    if (this.pipeline) {
      console.log(`[Transformers v4: ${this.active_config_key}] pipeline initialized using ${this.active_config_key}`);
    }else{
      throw last_error || new Error('Failed to initialize transformers pipeline');
    }
    this.tokenizer = await AutoTokenizer.from_pretrained(this.model_key);

  }


  /**
   * Count tokens in input text.
   * @param {string} input
   * @returns {Promise<{tokens:number}>}
   */
  async count_tokens(input) {
    if (!this.tokenizer) {
      await this.load();
    }
    const { input_ids } = await this.tokenizer(input);
    return { tokens: input_ids.data.length };
  }

  /**
   * Generate embeddings for multiple inputs.
   * @param {Array<Object>} inputs
   * @returns {Promise<Array<Object>>}
   */
  async embed_batch(inputs) {
    if (!this.pipeline) {
      await this.load();
    }
    const filtered_inputs = inputs.filter((item) => item.embed_input && item.embed_input.length > 0);
    if (!filtered_inputs.length) return [];

    const results = [];
    for (let i = 0; i < filtered_inputs.length; i += this.batch_size) {
      const batch = filtered_inputs.slice(i, i + this.batch_size);
      const batch_results = await this._process_batch(batch);
      results.push(...batch_results);
    }
    return results;
  }

  /**
   * Process a single batch – with per-item retry on failure.
   * @private
   * @param {Array<Object>} batch_inputs
   * @returns {Promise<Array<Object>>}
   */
  async _process_batch(batch_inputs) {
    const prepared = await Promise.all(
      batch_inputs.map((item) => this._prepare_input(item.embed_input))
    );
    const embed_inputs = prepared.map((p) => p.text);
    const tokens = prepared.map((p) => p.tokens);

    try {
      const resp = await this.pipeline(embed_inputs, { pooling: 'mean', normalize: true });
      return batch_inputs.map((item, i) => {
        const vec = Array.from(resp[i].data).map((val) => Math.round(val * 1e8) / 1e8);
        item.vec = vec;
        item.tokens = tokens[i];
        return item;
      });
    } catch (err) {
      if (should_bubble_webgpu_error(this.active_config_key, err)) {
        throw create_retryable_webgpu_error(err);
      }
      console.error('[Transformers v4] batch embed failed – retrying items individually', err);
      return await this._retry_items_individually(batch_inputs);
    }
  }

  /**
   * Prepare a single input by truncating to max_tokens if necessary.
   * @private
   * @param {string} embed_input
   * @returns {Promise<{text:string,tokens:number}>}
   */
  async _prepare_input(embed_input) {
    let { tokens } = await this.count_tokens(embed_input);
    if (tokens <= this.max_tokens) {
      return { text: embed_input, tokens };
    }

    let truncated = embed_input;
    while (tokens > this.max_tokens && truncated.length > 0) {
      const pct = this.max_tokens / tokens;
      const max_chars = Math.floor(truncated.length * pct * 0.9);
      truncated = truncated.slice(0, max_chars);
      const last_space = truncated.lastIndexOf(' ');
      if (last_space > 0) {
        truncated = truncated.slice(0, last_space);
      }
      tokens = (await this.count_tokens(truncated)).tokens;
    }
    return { text: truncated, tokens };
  }

  /**
   * Retry each item individually after a batch failure.
   * @private
   * @param {Array<Object>} batch_inputs
   * @returns {Promise<Array<Object>>}
   */
  async _retry_items_individually(batch_inputs) {
    await this._reset_pipeline_after_error();

    const results = [];
    for (const item of batch_inputs) {
      try {
        const prepared = await this._prepare_input(item.embed_input);
        const resp = await this.pipeline(prepared.text, { pooling: 'mean', normalize: true });
        const vec = Array.from(resp[0].data).map((val) => Math.round(val * 1e8) / 1e8);
        results.push({
          ...item,
          vec,
          tokens: prepared.tokens,
        });
      } catch (single_err) {
        if (should_bubble_webgpu_error(this.active_config_key, single_err)) {
          throw create_retryable_webgpu_error(single_err);
        }
        console.error('[Transformers v4] single item embed failed – skipping', single_err);
        results.push({
          ...item,
          vec: [],
          tokens: 0,
          error: single_err.message,
        });
      }
    }
    return results;
  }

  /**
   * Reset pipeline after a failure – falling back to WASM if needed.
   * @private
   * @returns {Promise<void>}
   */
  async _reset_pipeline_after_error() {
    try {
      if (this.pipeline) {
        if (typeof this.pipeline.destroy === 'function') {
          this.pipeline.destroy();
        } else if (typeof this.pipeline.dispose === 'function') {
          this.pipeline.dispose();
        }
      }
    } catch (err) {
      console.warn('[Transformers v4] error while resetting pipeline', err);
    }
    this.pipeline = null;

    await this.load_transformers_with_fallback();
  }

  /**
   * V2 intentionally exposes only model selection in the settings UI.
   * @returns {Object}
   */
  get settings_config() {
    return super.settings_config;
  }
}


export const transformers_models = {
  "TaylorAI/bge-micro-v2": {
    "id": "TaylorAI/bge-micro-v2",
    "batch_size": 1,
    "dims": 384,
    "max_tokens": 512,
    "name": "BGE-micro-v2",
    "description": "Local, 512 tokens, 384 dim (recommended)",
    "adapter": "transformers"
  },
  "Snowflake/snowflake-arctic-embed-xs": {
    "id": "Snowflake/snowflake-arctic-embed-xs",
    "batch_size": 1,
    "dims": 384,
    "max_tokens": 512,
    "name": "Snowflake Arctic Embed XS",
    "description": "Local, 512 tokens, 384 dim",
    "adapter": "transformers"
  },
  "Snowflake/snowflake-arctic-embed-s": {
    "id": "Snowflake/snowflake-arctic-embed-s",
    "batch_size": 1,
    "dims": 384,
    "max_tokens": 512,
    "name": "Snowflake Arctic Embed Small",
    "description": "Local, 512 tokens, 384 dim",
    "adapter": "transformers"
  },
  "Snowflake/snowflake-arctic-embed-m": {
    "id": "Snowflake/snowflake-arctic-embed-m",
    "batch_size": 1,
    "dims": 768,
    "max_tokens": 512,
    "name": "Snowflake Arctic Embed Medium",
    "description": "Local, 512 tokens, 768 dim",
    "adapter": "transformers"
  },
  "TaylorAI/gte-tiny": {
    "id": "TaylorAI/gte-tiny",
    "batch_size": 1,
    "dims": 384,
    "max_tokens": 512,
    "name": "GTE-tiny",
    "description": "Local, 512 tokens, 384 dim",
    "adapter": "transformers"
  },
  "onnx-community/embeddinggemma-300m-ONNX": {
    "id": "onnx-community/embeddinggemma-300m-ONNX",
    "batch_size": 1,
    "dims": 768,
    "max_tokens": 2048,
    "name": "EmbeddingGemma-300M",
    "description": "Local, 2,048 tokens, 768 dim",
    "adapter": "transformers"
  },
  "Mihaiii/Ivysaur": {
    "id": "Mihaiii/Ivysaur",
    "batch_size": 1,
    "dims": 384,
    "max_tokens": 512,
    "name": "Ivysaur",
    "description": "Local, 512 tokens, 384 dim",
    "adapter": "transformers"
  },
  "andersonbcdefg/bge-small-4096": {
    "id": "andersonbcdefg/bge-small-4096",
    "batch_size": 1,
    "dims": 384,
    "max_tokens": 4096,
    "name": "BGE-small-4K",
    "description": "Local, 4,096 tokens, 384 dim",
    "adapter": "transformers"
  },
  // Too slow and persistent crashes
  // "jinaai/jina-embeddings-v2-base-de": {
  //   "id": "jinaai/jina-embeddings-v2-base-de",
  //   "batch_size": 1,
  //   "dims": 768,
  //   "max_tokens": 4096,
  //   "name": "jina-embeddings-v2-base-de",
  //   "description": "Local, 4,096 tokens, 768 dim, German",
  //   "adapter": "transformers"
  // },
  "Xenova/jina-embeddings-v2-base-zh": {
    "id": "Xenova/jina-embeddings-v2-base-zh",
    "batch_size": 1,
    "dims": 768,
    "max_tokens": 8192,
    "name": "Jina-v2-base-zh-8K",
    "description": "Local, 8,192 tokens, 768 dim, Chinese/English bilingual",
    "adapter": "transformers"
  },
  "Xenova/jina-embeddings-v2-small-en": {
    "id": "Xenova/jina-embeddings-v2-small-en",
    "batch_size": 1,
    "dims": 512,
    "max_tokens": 8192,
    "name": "Jina-v2-small-en",
    "description": "Local, 8,192 tokens, 512 dim",
    "adapter": "transformers"
  },
  "nomic-ai/nomic-embed-text-v1.5": {
    "id": "nomic-ai/nomic-embed-text-v1.5",
    "batch_size": 1,
    "dims": 768,
    "max_tokens": 2048,
    "name": "Nomic-embed-text-v1.5",
    "description": "Local, 8,192 tokens, 768 dim",
    "adapter": "transformers"
  },
  "Xenova/bge-small-en-v1.5": {
    "id": "Xenova/bge-small-en-v1.5",
    "batch_size": 1,
    "dims": 384,
    "max_tokens": 512,
    "name": "BGE-small",
    "description": "Local, 512 tokens, 384 dim",
    "adapter": "transformers"
  },
  "nomic-ai/nomic-embed-text-v1": {
    "id": "nomic-ai/nomic-embed-text-v1",
    "batch_size": 1,
    "dims": 768,
    "max_tokens": 2048,
    "name": "Nomic-embed-text",
    "description": "Local, 2,048 tokens, 768 dim",
    "adapter": "transformers"
  }
};

/**
 * Default settings configuration for transformers adapter
 * @type {Object}
 */
export const transformers_settings_config = {
  // "[ADAPTER].legacy_transformers": {
  //   name: 'Legacy transformers (no GPU)',
  //   type: "toggle",
  //   description: "Use legacy transformers (v2) instead of v3. This may resolve issues if the local embedding isn't working.",
  //   callback: 'embed_model_changed',
  //   default: true,
  // },
};

// 2025-11-26
export const settings_config = {
  // "legacy_transformers": {
  //   name: 'Legacy transformers (no GPU)',
  //   type: "toggle",
  //   description: "Use legacy transformers (v2) instead of v3. This may resolve issues if the local embedding isn't working.",
  //   // callback: 'embed_model_changed',
  //   // default: false,
  // },
}
export default {
  class: SmartEmbedTransformersAdapter,
  settings_config,
};


let model = null;

async function process_message(data) {
  const { method, params, id, iframe_id } = data;
  try {
    let result;
    switch (method) {
      case 'init':
        console.log('init');
        break;
      case 'load':
        const model_params = {data: params, ...params};
        console.log('load', {model_params});
        model = new SmartEmbedTransformersAdapter(model_params);
        await model.load();
        result = { model_loaded: true, model_config_key: model.active_config_key };
        break;
      case 'embed_batch':
        if (!model) throw new Error('Model not loaded');
        result = await model.embed_batch(params.inputs);
        break;
      case 'count_tokens':
        if (!model) throw new Error('Model not loaded');
        result = await model.count_tokens(params.input);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    return { id, result, iframe_id };
  } catch (error) {
    console.error('Error processing message:', error);
    return { id, error: get_error_message(error), iframe_id };
  }
}
process_message({ method: 'init' });
