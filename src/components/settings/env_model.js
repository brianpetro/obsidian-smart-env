import { SmartModelModal, show_new_model_menu } from '../../modals/smart_model_modal.js';
import styles from './env_model.css';
import { Menu, setIcon } from 'obsidian';

function build_html (model, params) {
  const details = [
    `Provider: ${model.data.provider_key}`,
    `Model: ${model.data.model_key || '**MISSING - EDIT & SELECT MODEL**'}`,
  ];
  return `<div class="model-info">
    <div class="smart-env-settings-header">
      <b>Current: ${model.display_name} <span class="test-result-icon" data-icon="${get_test_result_icon_name(model)}"></span></b>
      <div>
        <button class="edit-model">Edit</button>
        <button class="test-model">Test</button>
      </div>
    </div>
    <pre>${details.join('\n')}</pre>
  </div>`;
}
export async function render (model, params) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html.call(this, model, params));
  const container = frag.firstElementChild;
  post_process.call(this, model, container, params);
  return container;
}
async function post_process (model, container, params) {
  const edit_btn = container.querySelector('.edit-model');
  const test_btn = container.querySelector('.test-model');
  const icon_el = container.querySelector('.test-result-icon');
  setIcon(icon_el, get_test_result_icon_name(model));
  edit_btn.addEventListener('click', () => {
    new SmartModelModal(model).open();
  });
  test_btn.addEventListener('click', () => {
    new SmartModelModal(model, { test_on_open: true }).open();
  });
  
  return container;
}

function get_test_result_icon_name (model) {
  switch (model.data.test_passed) {
    case true:
      return 'square-check-big';
    case false:
      return 'circle-x';
    default:
      return 'square';
  }
}