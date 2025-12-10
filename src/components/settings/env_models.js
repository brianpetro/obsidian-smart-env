import { Menu, setIcon } from 'obsidian';
import { SmartModelModal, show_new_model_menu } from '../../modals/smart_model_modal.js';

function build_html (env, params) {
  const models_collections = [
    env.embedding_models,
    env.chat_completion_models,
    env.ranking_models,
  ].filter(Boolean);
  const type_containers = models_collections.map(models_collection => {
    return `<div data-collection-key="${models_collection.collection_key}"></div>`;
  }).join('\n');
  return `<div class="env-model-types">
    ${type_containers}
  </div>`;
}
export async function render (env, params) {
  const frag = this.create_doc_fragment(build_html(env, params));
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}
async function post_process (env, container, params) {
  const collection_containers = container.querySelectorAll('div[data-collection-key]');
  for (const collection_container of collection_containers) {
    const collection_key = collection_container.getAttribute('data-collection-key');
    const models_collection = env[collection_key];
    env.smart_components.render_component('settings_env_model_type', models_collection).then((model_type_el) => {
      this.empty(collection_container);
      collection_container.appendChild(model_type_el);
    });
  }

  return container;
}