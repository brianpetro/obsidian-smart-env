import { SmartModelModal } from '../../modals/smart_model_modal.js';
import styles from './env_model.css';
import { setIcon } from 'obsidian';

function build_html (model, params) {
  const details = [
    `Provider: ${model.data.provider_key}`,
    `Model: ${model.data.model_key || '**MISSING - EDIT & SELECT MODEL**'}`,
  ];
  return `<div class="model-info">
    <div class="smart-env-settings-header">
      <div class="model-info-content">
        <b>${model.display_name} <span class="test-result-icon" data-icon="${get_test_result_icon_name(model)}"></span></b>
        <pre>${details.join('    ')}</pre>
      </div>
      <div class="model-actions">
        <div class="model-action-buttons">
          <button class="edit-model">Edit</button>
          <button class="test-model">Test</button>
          ${params.is_default ? '<small>Current</small>' : '<button class="delete-model">Delete</button>'}
        </div>
        <div class="model-delete-confirm" hidden>
          <span class="model-delete-confirm-label">Delete?</span>
          <button class="cancel-delete-model">Cancel</button>
          <button class="confirm-delete-model mod-warning">Delete</button>
        </div>
      </div>
    </div>
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
  const delete_btn = container.querySelector('.delete-model');
  const action_buttons = container.querySelector('.model-action-buttons');
  const delete_confirm = container.querySelector('.model-delete-confirm');
  const cancel_delete_btn = container.querySelector('.cancel-delete-model');
  const confirm_delete_btn = container.querySelector('.confirm-delete-model');
  const icon_el = container.querySelector('.test-result-icon');
  setIcon(icon_el, get_test_result_icon_name(model));
  edit_btn.addEventListener('click', () => {
    new SmartModelModal(model).open();
  });
  test_btn.addEventListener('click', () => {
    new SmartModelModal(model, { test_on_open: true }).open();
  });
  delete_btn?.addEventListener('click', () => {
    action_buttons.hidden = true;
    delete_confirm.hidden = false;
  });
  cancel_delete_btn?.addEventListener('click', () => {
    delete_confirm.hidden = true;
    action_buttons.hidden = false;
  });
  confirm_delete_btn?.addEventListener('click', () => {
    model.delete_model();
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
