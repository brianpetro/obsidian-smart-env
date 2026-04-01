/**
 * @param {import('./list').PluginListItem} item
 */
export function build_html(item, params = {}) {
  return `<div class="setting-item pro-plugins-list-item" data-item-type="${item.item_type}" data-item-state="${item.state || ''}" data-row-control-state="${item.row_control_state}">
    <div class="setting-item-info">
      <div class="setting-item-name ${item.item_type === 'core' ? 'smart-badge core-badge' : 'smart-badge pro-badge'}">${item.formatted_name}</div>
      <div class="setting-item-description">${item.formatted_description}</div>
    </div>
    <div class="setting-item-control"></div>
  </div>`;
}

/**
 * @param {import('./list').PluginListItem} item
 */
export async function render(item, params = {}) {
  const html = build_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, item, container, params);
  return container;
}

/**
 * @param {import('./list').PluginListItem} item
 */
export async function post_process(item, container, params = {}) {
  const control_container = container.querySelector('.setting-item-control');
  if (!control_container) return container;

  const controls = await render_controls.call(this, item, params);
  this.empty(control_container);
  if (controls) control_container.appendChild(controls);

  return container;
}

function build_controls_html(item, params = {}) {
  return `<div class="smart-plugins-list-item-controls">${item.control_specs.map(build_control_html).join('')}</div>`;
}

async function render_controls(item, params = {}) {
  const html = build_controls_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process_controls.call(this, item, container, params);
  return container;
}

async function post_process_controls(item, container, params = {}) {
  const buttons = container.querySelectorAll('button[data-action]');
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const action = button.getAttribute('data-action');
      if (!action) return;

      const busy_text = item.get_busy_text(action);
      if (busy_text) {
        await run_busy_action(button, async () => {
          await item.handle_action(action, params);
        }, busy_text);
        return;
      }

      await item.handle_action(action, params);
    });
  }

  return container;
}

function build_control_html(control_spec) {
  if (control_spec.type === 'status') {
    return `<span class="core-installed-text">${control_spec.text}</span>`;
  }

  const class_name = control_spec.variant === 'primary' ? 'mod-cta' : '';
  return `<button class="${class_name}" data-action="${control_spec.action}">${control_spec.text}</button>`;
}

async function run_busy_action(button, callback, busy_text) {
  if (!button || typeof callback !== 'function') return;

  const idle_text = button.textContent;
  button.disabled = true;
  if (busy_text) button.textContent = busy_text;

  try {
    await callback();
  } finally {
    button.disabled = false;
    button.textContent = idle_text;
  }
}
