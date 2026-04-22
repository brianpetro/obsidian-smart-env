import {
  SmartEmbedTransformersIframeAdapter,
  settings_config
} from "smart-embed-model/adapters/transformers_iframe.js";
import transformers_iframe from "./transformers_v4.iframe.js";
export class TransformersIframeEmbeddingModelAdapter extends SmartEmbedTransformersIframeAdapter {
  constructor(model) {
    super(model);
    /** @type {string} Connector script content */
    const old_connector = this.connector;
    this._old_connector = old_connector;
    this.connector = transformers_iframe;
    ;
    console.log('transformers iframe connector', this.model);
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
   * Handle response message from worker/iframe
   * ADDS FALLBACK TO OLD CONNECTOR ON LOAD FAILURE (v3.8.0)
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

    if (this.message_queue[id]) {
      if (error) {
        if (this.state !== 'loaded' && this._old_connector) {
          this.connector = this._old_connector;
          delete this._old_connector;
          console.warn('Falling back to old connector due to error:', error);
          this.load();
          this.message_queue[id].reject(new Error('Failed to load model with new connector, falling back to old connector. Original error: ' + error));
          return;
        }
        this.message_queue[id].reject(new Error(error));
      } else {
        this.message_queue[id].resolve(result);
      }
      delete this.message_queue[id];
    }
  }
}
export default {
  class: TransformersIframeEmbeddingModelAdapter,
  settings_config,
};