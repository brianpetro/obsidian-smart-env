import base from "smart-models/collections/embedding_models.js";
// import transformers from "../adapters/embedding-model/transformers_v4_iframe.js";
import transformers from "../adapters/embedding-model/transformers_v4_worker.js";

base.providers = {
  transformers,
};
base.api_key_is_credential_id = true;

export default base;
