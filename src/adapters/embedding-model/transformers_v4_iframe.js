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
const iframe_timeout_error_code = 'IFRAME_REPLY_TIMEOUT';
const iframe_reply_timeout_ms = Object.freeze({
  load: 120000,
  default: 30000,
});

function is_retryable_webgpu_error(error_message = '') {
  const normalized_error_message = String(error_message || '');
  return retryable_webgpu_error_patterns.some((pattern) => pattern.test(normalized_error_message));
}

function is_iframe_timeout_error(error_message = '') {
  return new RegExp(`\\b${iframe_timeout_error_code}\\b`, 'i')
    .test(String(error_message || ''))
  ;
}

function create_iframe_timeout_error(method = '') {
  const normalized_method = String(method || 'unknown');
  return new Error(`${iframe_timeout_error_code}: No reply from transformers iframe for "${normalized_method}"`);
}

function to_error(error) {
  return error instanceof Error
    ? error
    : new Error(String(error || 'Unknown error'))
  ;
}

export class TransformersIframeEmbeddingModelAdapter extends SmartEmbedTransformersIframeAdapter {
  constructor(model) {
    super(model);
    /** @type {string} Connector script content */
    const old_connector = this.connector;
    this._old_connector = old_connector;
    this.connector = transformers_iframe;
    this._disable_webgpu = false;
    this._reload_in_v4_promise = null;
    this._reload_without_webgpu_promise = null;
    this._reload_with_v3_promise = null;
    this._using_v3_connector = false;
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

  get_message_timeout_ms(method = '') {
    return iframe_reply_timeout_ms[method] || iframe_reply_timeout_ms.default;
  }

  clear_message_timeout(queue_entry = null) {
    if (!queue_entry?.timeout_id) return;
    clearTimeout(queue_entry.timeout_id);
    queue_entry.timeout_id = null;
  }

  /**
   * Store method/params so a recoverable iframe error can be retried transparently.
   * @protected
   * @param {string} method
   * @param {Object} params
   * @returns {Promise<any>}
   */
  async _send_message(method, params, message_options = {}) {
    return new Promise((resolve, reject) => {
      const id = `${this.message_prefix}${this.message_id++}`;
      const queue_entry = {
        resolve,
        reject,
        method,
        params,
        retried_in_v4: Boolean(message_options.retried_in_v4),
        retried_without_webgpu: Boolean(message_options.retried_without_webgpu),
        fell_back_to_v3: Boolean(message_options.fell_back_to_v3),
        timeout_id: null,
      };
      queue_entry.timeout_id = setTimeout(() => {
        if (!this.message_queue[id]) return;
        const timeout_error = create_iframe_timeout_error(method);
        this._handle_message_result(id, null, timeout_error.message);
      }, this.get_message_timeout_ms(method));

      this.message_queue[id] = queue_entry;
      try {
        this._post_message({ method, params, id });
      } catch (error) {
        this.clear_message_timeout(queue_entry);
        delete this.message_queue[id];
        reject(to_error(error));
      }
    });
  }

  should_retry_without_webgpu(error, queue_entry = {}) {
    if (this.use_gpu === false) return false;
    if (queue_entry.retried_without_webgpu) return false;
    return is_retryable_webgpu_error(error) || is_iframe_timeout_error(error);
  }

  should_retry_in_v4(error, queue_entry = {}) {
    if (queue_entry.method === 'load') return false;
    if (queue_entry.retried_in_v4) return false;
    if (queue_entry.retried_without_webgpu) return false;
    if (this._using_v3_connector) return false;
    if (is_retryable_webgpu_error(error)) return false;
    if (is_iframe_timeout_error(error)) return false;
    return true;
  }

  can_fallback_to_v3(queue_entry = {}) {
    return Boolean(this._old_connector)
      && !this._using_v3_connector
      && !queue_entry.fell_back_to_v3
    ;
  }

  should_fallback_to_v3(error, queue_entry = {}) {
    if (!this.can_fallback_to_v3(queue_entry)) return false;
    return Boolean(
      queue_entry.method === 'load'
      || queue_entry.retried_in_v4
      || queue_entry.retried_without_webgpu
      || this._disable_webgpu
      || is_iframe_timeout_error(error)
    );
  }

  async reload_iframe_in_v4() {
    if (this._reload_in_v4_promise) {
      return this._reload_in_v4_promise;
    }

    this.state = 'loading';
    this.model.model_loaded = false;
    this.model.load_result = null;

    this._reload_in_v4_promise = this.load()
      .finally(() => {
        this._reload_in_v4_promise = null;
      })
    ;

    return this._reload_in_v4_promise;
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

  async reload_iframe_with_v3() {
    if (this._reload_with_v3_promise) {
      return this._reload_with_v3_promise;
    }
    if (!this._old_connector) {
      throw new Error('Missing transformers v3 iframe connector');
    }

    this._using_v3_connector = true;
    this.connector = this._old_connector;
    this.state = 'loading';
    this.model.model_loaded = false;
    this.model.load_result = null;

    this._reload_with_v3_promise = this.load()
      .finally(() => {
        this._reload_with_v3_promise = null;
      })
    ;

    return this._reload_with_v3_promise;
  }

  async retry_message_in_v4(queue_entry) {
    await this.reload_iframe_in_v4();

    return await this._send_message(queue_entry.method, queue_entry.params, {
      retried_in_v4: true,
      retried_without_webgpu: queue_entry.retried_without_webgpu,
      fell_back_to_v3: queue_entry.fell_back_to_v3,
    });
  }

  async retry_message_without_webgpu(queue_entry) {
    await this.reload_iframe_without_webgpu();

    if (queue_entry.method === 'load') {
      return this.model.load_result || { model_loaded: true, webgpu_disabled: true };
    }

    return await this._send_message(queue_entry.method, queue_entry.params, {
      retried_in_v4: queue_entry.retried_in_v4,
      retried_without_webgpu: true,
      fell_back_to_v3: queue_entry.fell_back_to_v3,
    });
  }

  async fallback_to_v3_and_retry(queue_entry) {
    queue_entry.fell_back_to_v3 = true;
    await this.reload_iframe_with_v3();

    if (queue_entry.method === 'load') {
      return this.model.load_result || { model_loaded: true, v3_fallback: true };
    }

    return await this._send_message(queue_entry.method, queue_entry.params, {
      retried_in_v4: queue_entry.retried_in_v4,
      retried_without_webgpu: queue_entry.retried_without_webgpu,
      fell_back_to_v3: true,
    });
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
    if (!id.startsWith(this.message_prefix)) return;

    if (result?.model_loaded) {
      console.log('model loaded');
      this.state = 'loaded';
      this.model.model_loaded = true; // DEPRECATED
      this.model.load_result = result;
    }

    const queue_entry = this.message_queue[id];
    if (!queue_entry) return;
    this.clear_message_timeout(queue_entry);

    if (error) {
      if (this.should_retry_without_webgpu(error, queue_entry)) {
        queue_entry.retried_without_webgpu = true;
        delete this.message_queue[id];
        console.warn('Retrying transformers v4 iframe without WebGPU due to recoverable error:', error);
        this.retry_message_without_webgpu(queue_entry)
          .then((retry_result) => {
            queue_entry.resolve(retry_result);
          })
          .catch((retry_error) => {
            if (this.should_fallback_to_v3(retry_error, queue_entry)) {
              console.warn('Falling back to transformers v3 iframe connector after v4 CPU retry failed:', retry_error);
              this.fallback_to_v3_and_retry(queue_entry)
                .then((fallback_result) => {
                  queue_entry.resolve(fallback_result);
                })
                .catch((fallback_error) => {
                  queue_entry.reject(to_error(fallback_error));
                })
              ;
              return;
            }

            queue_entry.reject(to_error(retry_error));
          })
        ;
        return;
      }

      if (this.should_retry_in_v4(error, queue_entry)) {
        queue_entry.retried_in_v4 = true;
        delete this.message_queue[id];
        console.warn('Retrying transformers v4 iframe after hard non-load error:', error);
        this.retry_message_in_v4(queue_entry)
          .then((retry_result) => {
            queue_entry.resolve(retry_result);
          })
          .catch((retry_error) => {
            if (this.should_fallback_to_v3(retry_error, queue_entry)) {
              console.warn('Falling back to transformers v3 iframe connector after bounded v4 retry failed:', retry_error);
              this.fallback_to_v3_and_retry(queue_entry)
                .then((fallback_result) => {
                  queue_entry.resolve(fallback_result);
                })
                .catch((fallback_error) => {
                  queue_entry.reject(to_error(fallback_error));
                })
              ;
              return;
            }

            queue_entry.reject(to_error(retry_error));
          })
        ;
        return;
      }

      if (this.should_fallback_to_v3(error, queue_entry)) {
        delete this.message_queue[id];
        console.warn('Falling back to transformers v3 iframe connector due to error:', error);
        this.fallback_to_v3_and_retry(queue_entry)
          .then((fallback_result) => {
            queue_entry.resolve(fallback_result);
          })
          .catch((fallback_error) => {
            queue_entry.reject(to_error(fallback_error));
          })
        ;
        return;
      }

      queue_entry.reject(to_error(error));
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
