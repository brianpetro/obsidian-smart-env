import {
  get_by_path,
  set_by_path,
} from 'smart-utils';
import {Setting} from 'obsidian';

export function build_html(scope, params = {}) {
  return `<div class="smart-form-dropdown-component"></div>`;
}

export async function render(scope, params = {}) {
  const html = build_html.call(this, scope, params);
  const frag = this.create_doc_fragment(html);
  return await post_process.call(this, scope, frag, params);
}

/**
 * @param {object} scope - The scope object containing settings.
 * @param {HTMLElement} container - The container element to render the dropdown into.
 * @param {object} params - Additional parameters for rendering.
 * @param {string} params.setting_key - The key in the scope.settings to bind the dropdown value to.
 * @param {Array} params.options - The options for the dropdown, each option should be an object with 'value' and 'label' properties.
 * @param {Function} [params.on_change] - Optional callback function to be called when the dropdown value changes. NOTE/WARNING: Skips automatic setting of value in scope.settings.
 * @returns {HTMLElement} The container with the rendered dropdown.
 */
export async function post_process(scope, container, params = {}) {
  if (!scope) {
    container.textContent = 'Error: scope is required for dropdown component.';
    return container;
  }
  const settings = scope.settings;
  if (!settings || typeof settings !== 'object') {
    container.textContent = 'Error: scope.settings{} is required for dropdown component.';
    return container;
  }
  const setting_key = params.setting_key;
  if (!setting_key) {
    container.textContent = 'Error: setting_key is required for dropdown component.';
    return container;
  }
  const options = params.options;
  if (!Array.isArray(options) || options.length === 0) {
    container.textContent = 'Error: options[] is required for dropdown component.';
    return container;
  }

  const setting = new Setting(container);
  if (params.label && typeof setting.setName === 'function') {
    setting.setName(params.label);
  }
  if (params.description && typeof setting.setDesc === 'function') {
    setting.setDesc(params.description);
  }
  if (params.tooltip && typeof setting.setTooltip === 'function') {
    setting.setTooltip(params.tooltip);
  }

  const current_value = get_by_path(settings, setting_key) ?? '';

  let select_el = null;

  setting.addDropdown((dropdown) => {
    console.log({dropdown, current_value, scope, options});
    select_el = dropdown.selectEl;
    if (params.required) {
      select_el.setAttribute('required', 'true');
    }

    options.forEach((opt) => {
      dropdown.addOption(opt.value, opt.label);
    });
    select_el.childNodes.forEach((option_el) => {
      if (option_el.value === current_value) {
        option_el.selected = true;
      }
      if (options.find(o => o.value === option_el.value)?.disabled) {
        option_el.disabled = true;
      }
    });

    if (select_el) {
      select_el.value = current_value;
    }
  });

  const handler = () => {
    const value = select_el.value;
    // skip set_by_path if on_change is defined
    if (typeof params.on_change === 'function') {
      params.on_change(value, { scope, setting_key, select_el, container });
    } else {
      set_by_path(scope.settings, setting_key, value);
    }
  };
  select_el.addEventListener('change', handler);
  this.attach_disposer(select_el, () => {
    select_el.removeEventListener('change', handler);
  });

  return container;
}

render.version = 0.2;
