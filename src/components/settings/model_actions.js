function build_html(model, params = {}) {
  return `<div class="smart-model-modal-actions">
    <button class="new-model-btn">New</button>
    <button class="delete-model-btn">Delete</button>
    <div class="confirm-delete-container" style="display:none;">
      <span>Are you sure?</span>
      <button class="confirm-delete-yes-btn">Yes</button>
      <button class="confirm-delete-no-btn">No</button>
    </div>
  </div>`;
}

export async function render(model, params = {}) {
  const frag = this.create_doc_fragment(build_html(model, params));
  const container = frag.firstElementChild;
  post_process.call(this, model, container, params);
  return container;
}

async function post_process(model, container, params = {}) {
  const new_model_btn = container.querySelector('.new-model-btn');
  new_model_btn.addEventListener('click', async (event) => {
    const on_before_new = params.on_before_new;
    const opts = {};
    if (typeof on_before_new === 'function') {
      opts.on_before_new = on_before_new;
    }
    show_new_model_menu(this.collection, event, opts);
  });
  const delete_model_btn = container.querySelector('.delete-model-btn');
  const confirm_delete_container = container.querySelector('.confirm-delete-container');
  const confirm_delete_yes_btn = container.querySelector('.confirm-delete-yes-btn');
  const confirm_delete_no_btn = container.querySelector('.confirm-delete-no-btn');
  delete_model_btn.addEventListener('click', async () => {
    confirm_delete_container.style.display = '';
  });
  confirm_delete_no_btn.addEventListener('click', async () => {
    confirm_delete_container.style.display = 'none';
  });
  confirm_delete_yes_btn.addEventListener('click', async () => {
    await model.delete_model();
    if (typeof params.on_after_delete === 'function') {
      params.on_after_delete();
    }
  });

  return container;
}