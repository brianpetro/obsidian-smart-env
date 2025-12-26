import {
  SmartEmbedTransformersIframeAdapter,
  settings_config
} from "smart-embed-model/adapters/transformers_iframe.js";
export class TransformersIframeEmbeddingModelAdapter extends SmartEmbedTransformersIframeAdapter {
  constructor(model_item) {
    super(model_item);
    // this.opts = model_item; // backward compatibility
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
      // "onnx-community/embeddinggemma-300m-ONNX": {
      //   "id": "onnx-community/embeddinggemma-300m-ONNX",
      //   "batch_size": 1,
      //   "dims": 768,
      //   "max_tokens": 2048,
      //   "name": "EmbeddingGemma 300M",
      //   "description": "Local, 512 tokens, 768 dim",
      //   "adapter": "transformers"
      // }
    };
  }
}
export default {
  class: TransformersIframeEmbeddingModelAdapter,
  settings_config,
};