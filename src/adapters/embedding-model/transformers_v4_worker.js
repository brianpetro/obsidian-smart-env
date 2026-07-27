import { SmartEmbedMessageAdapter } from "smart-embed-model/adapters/_message.js";
import transformers_worker from "./transformers_v4.worker.js";

const transformers_default_batch_sizes = Object.freeze({
  webgpu: 16,
  cpu: 8,
});

const transformers_models = {
  "TaylorAI/bge-micro-v2": {
    id: "TaylorAI/bge-micro-v2",
    batch_size: 1,
    dims: 384,
    max_tokens: 512,
    dtype: "auto",
    semantic_profile: {
      // Matches the legacy worker behavior, so no new embedding space is needed.
      pooling: "mean",
      normalize: true,
      query_prefix: "",
      document_prefix: "",
    },
    name: "BGE-micro-v2 (fastest)",
    description: "Local, 512 tokens, 384 dim (recommended)",
    adapter: "transformers",
  },
  "Snowflake/snowflake-arctic-embed-xs": {
    id: "Snowflake/snowflake-arctic-embed-xs",
    batch_size: 1,
    dims: 384,
    max_tokens: 512,
    dtype: "auto",
    semantic_profile: {
      embedding_space_id: "Snowflake/snowflake-arctic-embed-xs/retrieval-v1",
      pooling: "cls",
      normalize: true,
      query_prefix: "Represent this sentence for searching relevant passages: ",
      document_prefix: "",
    },
    name: "Snowflake Arctic Embed XS (fast)",
    description: "Local, 512 tokens, 384 dim",
    adapter: "transformers",
  },
  "Xenova/multilingual-e5-small": {
    id: "Xenova/multilingual-e5-small",
    batch_size: 1,
    dims: 384,
    max_tokens: 512,
    dtype: "auto",
    semantic_profile: {
      embedding_space_id: "Xenova/multilingual-e5-small/retrieval-v1",
      pooling: "mean",
      normalize: true,
      query_prefix: "query: ",
      document_prefix: "passage: ",
    },
    name: "Multilingual E5 Small",
    description: "Local, 512 tokens, 384 dim",
    adapter: "transformers",
  },
};

export const settings_config = {};

export class TransformersWorkerEmbeddingModelAdapter extends SmartEmbedMessageAdapter {
  static defaults = {
    adapter: 'transformers',
    description: 'Transformers (Local, built-in)',
    default_model: 'TaylorAI/bge-micro-v2',
    models: transformers_models,
  };

  constructor(model) {
    super(model);
    /** @type {Worker|null} */
    this.worker = null;
    /** @type {string|null} */
    this.worker_url = null;
    /** @type {string|null} */
    this.active_config_key = null;
    /** @type {Promise<void>|null} */
    this._load_promise = null;
    /** @type {string|null} */
    this._load_key = null;
  }

  get use_gpu() {
    if (typeof this.model?.data?.use_gpu === 'boolean') {
      return this.model.data.use_gpu;
    }
    return undefined;
  }

  get semantic_profile() {
    return this.models[this.model.model_key]?.semantic_profile;
  }

  get dtype() {
    return this.models[this.model.model_key]?.dtype || 'auto';
  }

  get configured_batch_size() {
    const configured_batch_size = Number(this.model?.data?.batch_size);
    if (!Number.isFinite(configured_batch_size) || configured_batch_size <= 1) {
      return null;
    }
    return Math.min(16, Math.floor(configured_batch_size));
  }

  /**
   * Resolve the queue batch size from the configured or active worker backend.
   * @returns {number}
   */
  get batch_size() {
    if (this.configured_batch_size) return this.configured_batch_size;
    if (this.use_gpu === false) return transformers_default_batch_sizes.cpu;
    if (this.active_config_key && !this.active_config_key.includes('webgpu')) {
      return transformers_default_batch_sizes.cpu;
    }
    return transformers_default_batch_sizes.webgpu;
  }

  /** @returns {number} */
  get batch_window_size() {
    return 64;
  }

  /** @returns {boolean} */
  get batch_sort_by_input_length() {
    return true;
  }

  get models() {
    return transformers_models;
  }

  get_models() {
    return Promise.resolve(this.models);
  }

  load_background() {
    return Promise.resolve(this.load())
      .catch((error) => {
        if (error?.message === 'Message adapter unloaded') return;
        console.error(`[${this.constructor.name}] load failed`, error);
      })
    ;
  }

  get load_key() {
    return JSON.stringify({
      model_key: this.model.model_key,
      max_tokens: Number(this.model?.data?.max_tokens) || 512,
      batch_size: this.configured_batch_size,
      use_gpu: this.use_gpu !== false,
      dtype: this.dtype,
      semantic_profile: this.semantic_profile,
    });
  }

  /**
   * Coalesce identical loads and retain an already loaded worker.
   * @returns {Promise<void>}
   */
  load() {
    const load_key = this.load_key;
    if (this.worker && this.state === 'loaded' && this._load_key === load_key) {
      return Promise.resolve();
    }
    if (this._load_promise && this._load_key === load_key) {
      return this._load_promise;
    }

    const load_promise = this._load_worker();
    this._load_key = load_key;
    const tracked_promise = load_promise.finally(() => {
      if (this._load_promise !== tracked_promise) return;
      this._load_promise = null;
      if (this.state !== 'loaded') this._load_key = null;
    });
    this._load_promise = tracked_promise;
    return tracked_promise;
  }

  /**
   * Initialize one worker and load the model within it.
   * @private
   * @returns {Promise<void>}
   */
  async _load_worker() {
    this.unload();
    this.state = 'loading';
    let worker = null;

    try {
      const worker_blob = new Blob([transformers_worker], { type: 'text/javascript' });
      this.worker_url = URL.createObjectURL(worker_blob);
      worker = new Worker(this.worker_url, { type: 'module' });
      this.worker = worker;
      worker.onmessage = this._handle_message.bind(this);
      worker.onerror = this._handle_worker_error.bind(this);
      worker.onmessageerror = this._handle_worker_error.bind(this);

      await this._send_message('load', {
        model_key: this.model.model_key,
        max_tokens: this.model?.data?.max_tokens,
        batch_size: this.configured_batch_size,
        use_gpu: this.use_gpu,
        dtype: this.dtype,
        semantic_profile: this.semantic_profile,
      });
    } catch (error) {
      // An older canceled load must not tear down a newer worker.
      if (!worker || this.worker === worker) {
        this.destroy_worker();
        this.state = 'unloaded';
        this.reset_model_state();
      }
      throw error;
    }
  }

  reset_model_state() {
    this.active_config_key = null;
    this._load_key = null;
    if (!this.model) return;
    this.model.model_loaded = false;
    this.model.load_result = null;
  }

  destroy_worker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.worker_url) {
      URL.revokeObjectURL(this.worker_url);
      this.worker_url = null;
    }
  }

  unload() {
    this.destroy_worker();
    this.reset_model_state();
    super.unload();
  }

  /**
   * Post a request to the worker.
   * @protected
   * @param {Object} message_data
   */
  _post_message(message_data) {
    if (!this.worker) {
      throw new Error('Transformers worker not loaded');
    }
    this.worker.postMessage(message_data);
  }

  /**
   * Handle a worker response.
   * @private
   * @param {MessageEvent} event
   */
  _handle_message(event) {
    if (event.currentTarget !== this.worker) return;
    const {
      id,
      result,
      error,
      model_config_key,
    } = event.data || {};
    if (!id) return;

    this.active_config_key = model_config_key;
    this._handle_message_result(id, result, error);
  }

  /**
   * Reject pending work after an unrecoverable worker failure.
   * @private
   * @param {ErrorEvent|MessageEvent} event
   */
  _handle_worker_error(event) {
    if (event.currentTarget !== this.worker) return;
    const error_message = event.error?.message
      || event.message
      || 'Transformers worker failed'
    ;
    const pending_ids = Object.keys(this.message_queue);

    this.destroy_worker();
    this.state = 'unloaded';
    this.reset_model_state();

    pending_ids.forEach((id) => {
      if (!this.message_queue[id]) return;
      this._handle_message_result(id, null, error_message);
    });
  }
}

export default {
  class: TransformersWorkerEmbeddingModelAdapter,
  settings_config,
};
