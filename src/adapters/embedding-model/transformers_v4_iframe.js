import {
  SmartEmbedTransformersIframeAdapter,
  settings_config
} from "smart-embed-model/adapters/transformers_iframe.js";
import transformers_iframe from "./transformers_v4.iframe.js";

const retryable_webgpu_error_patterns = [
  /\bWEBGPU_RETRYABLE_ERROR\b/i,
  /no available backend found/i,
  /webgpuinit is not a function/i,
  /subgroupminsize/i,
];

function is_retryable_webgpu_error(error_message = '') {
  const normalized_error_message = String(error_message || '');
  return retryable_webgpu_error_patterns.some((pattern) => pattern.test(normalized_error_message));
}

export class TransformersIframeEmbeddingModelAdapter extends SmartEmbedTransformersIframeAdapter {
  constructor(model) {
    super(model);
    /** @type {string} Connector script content */
    const old_connector = this.connector;
    this._old_connector = old_connector;
    this.connector = transformers_iframe;
    this._disable_webgpu = false;
    this._reload_without_webgpu_promise = null;
    console.log('transformers iframe connector', this.model);
  }

  get use_gpu() {
    if (this._disable_webgpu) return false;
    if (typeof this.model?.data?.use_gpu === 'boolean') {
      return this.model.data.use_gpu;
    }
    return undefined;
  }

  get models () {
    return {
      "TaylorAI/bge-micro-v2": {
        "id": "TaylorAI/bge-micro-v2",
        "batch_size": 1,
        "dims": 384,
        "max_tokens": 512,
        "name": "BGE-micro-v2 (fastest)",
        "description": "Local, 512 tokens, 384 dim (recommended)",
        "adapter": "transformers"
      },
      "Snowflake/snowflake-arctic-embed-xs": {
        "id": "Snowflake/snowflake-arctic-embed-xs",
        "batch_size": 1,
        "dims": 384,
        "max_tokens": 512,
        "name": "Snowflake Arctic Embed XS (fast)",
        "description": "Local, 512 tokens, 384 dim",
        "adapter": "transformers"
      },
      "Xenova/multilingual-e5-small": {
        "id": "Xenova/multilingual-e5-small",
        "batch_size": 1,
        "dims": 384,
        "max_tokens": 512,
        "name": "Multilingual E5 Small",
        "description": "Local, 512 tokens, 384 dim",
        "adapter": "transformers"
      },
    };
  }

  /**
   * Store method/params so a recoverable iframe error can be retried transparently.
   * @protected
   * @param {string} method
   * @param {Object} params
   * @returns {Promise<any>}
   */
  async _send_message(method, params) {
    return new Promise((resolve, reject) => {
      const id = `${this.message_prefix}${this.message_id++}`;
      this.message_queue[id] = {
        resolve,
        reject,
        method,
        params,
        retried_without_webgpu: false,
      };
      this._post_message({ method, params, id });
    });
  }

  should_retry_without_webgpu(error, queue_entry = {}) {
    if (this.use_gpu === false) return false;
    if (queue_entry.retried_without_webgpu) return false;
    return is_retryable_webgpu_error(error);
  }

  async reload_iframe_without_webgpu() {
    if (this._reload_without_webgpu_promise) {
      return this._reload_without_webgpu_promise;
    }

    this._disable_webgpu = true;
    this.state = 'loading';
    this.model.model_loaded = false;
    this.model.load_result = null;

    this._reload_without_webgpu_promise = this.load()
      .finally(() => {
        this._reload_without_webgpu_promise = null;
      })
    ;

    return this._reload_without_webgpu_promise;
  }

  async retry_message_without_webgpu(queue_entry) {
    await this.reload_iframe_without_webgpu();

    if (queue_entry.method === 'load') {
      return this.model.load_result || { model_loaded: true, webgpu_disabled: true };
    }

    return await this._send_message(queue_entry.method, queue_entry.params);
  }

  /**
   * Handle response message from worker/iframe
   * ADDS WEBGPU-SPECIFIC RETRY BEFORE FALLBACK TO OLD CONNECTOR (v3.8.0)
   * @protected
   * @param {string} id - Message ID
   * @param {*} result - Response result
   * @param {Error} [error] - Response error
   */
  _handle_message_result(id, result, error) {
    console.log('Received message from iframe', { id, result, error });
    if (!id.startsWith(this.message_prefix)) return;

    if (result?.model_loaded) {
      console.log('model loaded');
      this.state = 'loaded';
      this.model.model_loaded = true; // DEPRECATED
      this.model.load_result = result;
    }

    const queue_entry = this.message_queue[id];
    if (!queue_entry) return;

    if (error) {
      if (this.should_retry_without_webgpu(error, queue_entry)) {
        queue_entry.retried_without_webgpu = true;
        console.warn('Retrying transformers v4 iframe without WebGPU due to recoverable error:', error);
        this.retry_message_without_webgpu(queue_entry)
          .then((retry_result) => {
            queue_entry.resolve(retry_result);
          })
          .catch((retry_error) => {
            queue_entry.reject(retry_error instanceof Error ? retry_error : new Error(String(retry_error)));
          })
          .finally(() => {
            delete this.message_queue[id];
          })
        ;
        return;
      }

      if (!this._disable_webgpu && this.state !== 'loaded' && this._old_connector) {
        this.connector = this._old_connector;
        delete this._old_connector;
        console.warn('Falling back to old connector due to error:', error);
        this.load();
        queue_entry.reject(new Error('Failed to load model with new connector, falling back to old connector. Original error: ' + error));
        delete this.message_queue[id];
        return;
      }

      queue_entry.reject(new Error(error));
      delete this.message_queue[id];
      return;
    }

    queue_entry.resolve(result);
    delete this.message_queue[id];
  }
}
export default {
  class: TransformersIframeEmbeddingModelAdapter,
  settings_config,
};
