// import { SettingGroup } from 'obsidian';
import { Setting, setIcon, Notice } from 'obsidian';
import { get_by_path, set_by_path } from 'smart-utils';
import {
  build_settings_group_map,
  resolve_group_settings_config,
} from './settings_config_utils.js';
// polyfill for Obsidian's SettingGroup not being available in older versions
// jsdocs using imported SettingGroup for type hinting purposes
/**
 * Polyfill for Obsidian's SettingGroup for older versions.
 * @extends {import('obsidian').SettingGroup}
 * @class SettingGroupPolyfill
 */
class SettingGroupPolyfill {
  constructor(container) {
    this.components = [];
    this.groupEl = container.createDiv("setting-group");
    this.headerEl = this.groupEl.createDiv("setting-item setting-item-heading");
    this.headerInnerEl = this.headerEl.createDiv("setting-item-name");
    this.controlEl = this.headerEl.createDiv("setting-item-control");
    this.listEl = this.groupEl.createDiv('setting-items');
  }
  setHeading(heading) {
    this.headerInnerEl.setText(heading);
  }
  addSetting(callback) {
    const setting = new Setting(this.listEl);
    this.components.push(setting);
    callback(setting);
    return setting;
  }
  addClass(class_name) {
    this.groupEl.addClass(class_name);
  }
}

export function render_settings_config(settings_config, scope, container, params = {}) {
  const {
    default_group_name = 'Settings',
  } = params;
  const settings_config_source = settings_config;
  const group_map = build_settings_group_map(settings_config, scope, default_group_name);
  const settings_groups = Object.entries(group_map)
    // sort group_name first
    .sort(([a], [b]) => (a === default_group_name ? -1 : b === default_group_name ? 1 : 0))
    // filter has at least one setting
    .filter(([, group_config]) => Object.keys(group_config).length > 0)
    // render each group
    .map(([group_name, group_config]) => {
      const group_container = container.createDiv();
      const group_params = {
        ...params,
        ...(params.group_params?.[group_name] || {}),
        settings_config_source,
      };
      return render_settings_group(
        group_name,
        scope,
        group_config,
        group_container,
        group_params
      );
    })
  ;
  return settings_groups;
}
/**
 * Render a settings group based on the provided configuration.
 * @param {string} group_name - The name of the settings group.
 * @param {object} scope - The scope containing settings.
 * @param {import('smart-types').SettingsConfig} settings_config - The configuration for the settings.
 * @param {HTMLElement} container - The container to render the settings into.
 * @param {object} params - Additional parameters for rendering.
 * @param {object|object[]} [params.heading_btn] - Optional heading button config(s).
 * @param {object|function} [params.settings_config_source] - Optional full settings config source.
 * @return {SettingGroup} The rendered settings group.
 */
export function render_settings_group(group_name, scope, settings_config, container, params = {}) {
  const settings_config_source = params.settings_config_source || settings_config;
  const settings_config_group = params.settings_config_source
    ? resolve_group_settings_config(
      settings_config_source,
      scope,
      group_name,
      params.default_group_name || 'Settings'
    )
    : settings_config;
  // attempt to use Obsidian's SettingGroup if available
  let SettingGroup;
  try {
    const obsidian_module = require('obsidian');
    if (obsidian_module.SettingGroup) {
      SettingGroup = obsidian_module.SettingGroup;
    } else {
      SettingGroup = SettingGroupPolyfill; // use polyfill
    }
  } catch (e) {
    SettingGroup = SettingGroupPolyfill; // use polyfill
  }
  settings_config = settings_config_group;
  const {
    heading_btn = null,
  } = params;
  const render_group = params.settings_config_source
    ? (group_name, scope, settings_config, container, group_params) => {
      const group_config = resolve_group_settings_config(
        settings_config,
        scope,
        group_name,
        group_params.default_group_name || 'Settings'
      );
      return render_settings_group(group_name, scope, group_config, container, group_params);
    }
    : render_settings_group;
  const rerender_settings_group = create_settings_group_rerender(scope, {
    container,
    group_name,
    settings_config: settings_config_source,
    group_params: params,
    render_group,
  });
  let setting_group = new SettingGroup(container);
  if (heading_btn && typeof heading_btn === 'object') {
    if(Array.isArray(heading_btn)) {
      for(const btn_config of heading_btn) {
        render_heading_button(setting_group, scope, btn_config);
      }
    } else {
      render_heading_button(setting_group, scope, heading_btn);
    }
  }
  setting_group.setHeading(group_name);
  for (const [setting_path, setting_config] of Object.entries(settings_config)) {
    if (!setting_config || typeof setting_config !== 'object') {
      console.warn(`Invalid setting config for ${setting_path}:`, setting_config);
      continue;
    }
    const settng_is_pro = setting_config.scope_class === 'pro-setting';
    const env_is_pro = !!scope.env?.is_pro || !!scope.is_pro;
    setting_group.addSetting(setting => {
      // console.log('Rendering setting:', setting);
      if (setting_config.name) setting.setName(setting_config.name);
      setting.setClass(setting_path.replace(/[^a-zA-Z0-9]/g, '-'));
      if (setting_config.type) setting.setClass(`setting-type-${setting_config.type}`);
      if (setting_config.description) {
        setting.setDesc(setting_config.description);
      }
      switch (setting_config.type) {
        case 'button':
          setting.addButton((btn) => {
            btn.setButtonText(setting_config.name || 'Run');
            btn.onClick(async (event) => {
              if (typeof setting_config.callback === 'function') {
                await handle_config_callback(setting, event, setting_config.callback, { scope });
              }
            });
          });
          break;
        case 'toggle':
          setting.addToggle((toggle) => {
            toggle.setValue(get_by_path(scope.settings, setting_path) || false);
            toggle.onChange((value) => {
              if(settng_is_pro && !env_is_pro) {
                new Notice('Nice try! This is a PRO feature. Please upgrade to access this setting.');
                return;
              }
              set_by_path(scope.settings, setting_path, value);
              if (typeof setting_config.callback === 'function') {
                handle_config_callback(setting, value, setting_config.callback, { scope });
              }
            });
          });
          break;
        case 'text':
          setting.addText((text) => {
            text.setValue(String(get_by_path(scope.settings, setting_path) || ''));
            text.onChange((value) => {
              set_by_path(scope.settings, setting_path, value);
            });
          });
          break;
        case 'number':
          setting.addText((text) => {
            text.setValue(String(get_by_path(scope.settings, setting_path) ?? '0'));
            text.inputEl.setAttribute('type', 'number');
            text.onChange((value) => {
              const num_value = Number(value);
              if (!isNaN(num_value)) {
                set_by_path(scope.settings, setting_path, num_value);
              }
              if (typeof setting_config.callback === 'function') {
                handle_config_callback(setting, num_value, setting_config.callback, { scope });
              }
            });
          });
          break;
        case 'dropdown':
          setting.addDropdown((dropdown) => {
            const options_callback = setting_config.options_callback;
            if (typeof options_callback === 'function') {
              const options = options_callback.call(scope, scope); // available as 'this' and param and scope arg
              options.forEach(opt => {
                const label = opt.label
                  || opt.name // DEPRECATED 2025-12-11
                  || opt.value
                ;
                dropdown.addOption(opt.value, label);
              });
            }
            dropdown.setValue(get_by_path(scope.settings, setting_path) || '');
            dropdown.onChange((value) => {
              set_by_path(scope.settings, setting_path, value);
              if (typeof setting_config.callback === 'function') {
                handle_config_callback(setting, value, setting_config.callback, { scope });
              }
              rerender_settings_group();
            });
          });
          break;
        case 'textarea':
          setting.addTextArea((text) => {
            text.setValue(String(get_by_path(scope.settings, setting_path) || ''));
            text.onChange((value) => {
              if(settng_is_pro && !env_is_pro) {
                new Notice('Nice try! This is a PRO feature. Please upgrade to access this setting.');
                return;
              }
              set_by_path(scope.settings, setting_path, value);
            });
            if(settng_is_pro && !env_is_pro) {
              text.setDisabled(true);
            }
          });
          break;
        case 'slider':
          setting.addSlider((slider) => {
            const min = setting_config.min || 0;
            const max = setting_config.max || 100;
            const step = setting_config.step || 1;
            slider.setLimits(min, max, step);
            slider.setValue(get_by_path(scope.settings, setting_path) || min);
            // slider.showTooltip();
            slider.setDynamicTooltip();
            slider.onChange((value) => {
              set_by_path(scope.settings, setting_path, value);
              if (typeof setting_config.callback === 'function') {
                handle_config_callback(setting, value, setting_config.callback, { scope });
              }
            });
          });
          break;
        case 'heading':
          setting.setHeading();
          break;
        case 'html':
          if (setting_config.value) {
            setting.descEl.replaceChildren(
              document.createRange().createContextualFragment(setting_config.value)
            );
          }
          break;
        default:
          console.warn(`Unsupported setting type for ${setting_path}:`, setting_config.type);
          break;

      }
      if (setting_config.scope_class) {
        setting.settingEl.addClass(setting_config.scope_class);
      }
      if(settng_is_pro && !env_is_pro) {
        // disable the entire setting if it's a pro setting and env is not pro (using obsidian api)
        setting.setDisabled(true);
      }
    });
  }
  return setting_group;
}

function render_heading_button(setting_group, scope, heading_btn) {
  // const heading_btn_setting = new Setting(setting_group.controlEl);
  // heading_btn_setting.addButton(btn => {
  //   if (heading_btn.btn_icon) btn.setIcon(heading_btn.btn_icon);
  //   if (heading_btn.btn_text) btn.setButtonText(heading_btn.btn_text || 'Execute');
  //   btn.onClick(async (event) => {
  //     if (typeof heading_btn.callback === 'function') {
  //       await handle_config_callback(heading_btn_setting, event, heading_btn.callback, { scope });
  //     } else {
  //       console.warn('No callback defined for heading button');
  //     }
  //   });
  // });
  const btn_el = setting_group.controlEl.createEl('button', { cls: '' });
  if (heading_btn.btn_icon) { setIcon(btn_el, heading_btn.btn_icon); }
  if (heading_btn.btn_text) { btn_el.setText(heading_btn.btn_text); }
  if (heading_btn.label) { btn_el.setAttr('aria-label', heading_btn.label); }
  btn_el.addEventListener('click', async (event) => {
    if (typeof heading_btn.callback === 'function') {
      await handle_config_callback(null, event, heading_btn.callback, { scope });
    } else {
      console.warn('No callback defined for heading button');
    }
  });
  setting_group.controlEl.appendChild(btn_el);
}

/**
 * Handle the callback for a setting configuration.
 * @param {Setting} setting - The setting instance.
 * @param {any} event_or_value - The event or value from the setting change (or button click passes event).
 * @param {function} cb - The callback function to execute.
 */
async function handle_config_callback(setting, event_or_value, cb, params = {}) {
  const {
    scope = null
  } = params;
  if (scope) {
    return await cb.call(scope, event_or_value, setting);
  } else {
    return await cb(event_or_value, setting);
  }
}

/**
 * Create a rerender callback for a settings group.
 * @param {object} scope - The scope containing settings.
 * @param {object} params - Parameters for rerendering.
 * @param {HTMLElement} params.container - The container to clear and re-render into.
 * @param {string} params.group_name - The name of the settings group.
 * @param {import('smart-types').SettingsConfig} params.settings_config - The configuration for the settings.
 * @param {object} [params.group_params] - Additional params for the settings group.
 * @param {function} params.render_group - Render function for the settings group.
 * @return {function} Rerender callback.
 */
export function create_settings_group_rerender(scope, params = {}) {
  const {
    container,
    group_name,
    settings_config,
    group_params = {},
    render_group,
  } = params;
  return () => {
    if (!container || typeof render_group !== 'function') return null;
    container.replaceChildren();
    return render_group(group_name, scope, settings_config, container, group_params);
  };
}