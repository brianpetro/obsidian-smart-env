import base from 'smart-models/collections/embedding_models.js';
import transformers from '../adapters/embedding-model/transformers_iframe.js';
base.providers = {
  transformers
}
export default base;