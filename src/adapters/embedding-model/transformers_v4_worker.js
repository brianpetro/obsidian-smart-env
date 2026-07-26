import { SmartEmbedMessageAdapter } from "smart-embed-model/adapters/_message.js";
import { settings_config } from "smart-embed-model/adapters/transformers_iframe.js";
import {
  TransformersIframeEmbeddingModelAdapter,
} from "./transformers_v4_iframe.js";
import transformers_worker from "./transformers_v4.worker.js";

export class TransformersWorkerEmbeddingModelAdapter extends TransformersIframeEmbeddingModelAdapter {
  constructor(model) {
    super(model);
    /** @type {Worker|null} */
    this.worker = null;
    /** @type {string|null} */
    this.worker_url = null;
  }

  /**
   * Initialize the worker and load the model.
   * @returns {Promise<void>}
   */
  async load() {
    this.unload();
    this.state = 'loading';
    let worker = null;

    try {
      const worker_blob = new Blob(
        [transformers_worker, '\n', this.connector],
        { type: 'text/javascript' },
      );
      this.worker_url = URL.createObjectURL(worker_blob);
      worker = new Worker(this.worker_url, { type: 'module' });
      this.worker = worker;
      worker.onmessage = this._handle_message.bind(this);
      worker.onerror = this._handle_worker_error.bind(this);
      worker.onmessageerror = this._handle_worker_error.bind(this);

      await this._send_message('load', {
        model_key: this.model.model_key,
        adapters: null,
        settings: null,
        batch_size: this.batch_size,
        use_gpu: this.use_gpu,
      });
    } catch (error) {
      // An older canceled load must not tear down a newer worker.
      if (!worker || this.worker === worker) {
        this.destroy_worker();
        this.state = 'unloaded';
      }
      throw error;
    }
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
    if (this.model) {
      this.model.model_loaded = false;
      this.model.load_result = null;
    }
    // Skip inherited iframe DOM cleanup while retaining message queue cleanup.
    SmartEmbedMessageAdapter.prototype.unload.call(this);
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
    const { id, result, error } = event.data || {};
    if (!id) return;
    this._handle_message_result(id, result, error);
  }

  /**
   * Route worker failures through the existing bounded retry/fallback path.
   * @private
   * @param {ErrorEvent|MessageEvent} event
   */
  _handle_worker_error(event) {
    if (event.currentTarget !== this.worker) return;
    const error_message = event.message || 'Transformers worker failed';
    const pending_ids = Object.keys(this.message_queue);
    this.destroy_worker();
    this.state = 'unloaded';
    this.model.model_loaded = false;
    this.model.load_result = null;

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
