import { PluginSettingTab } from 'obsidian';
import styles from './settings.css';
import { render_pre_env_load } from '../utils/render_pre_env_load.js';

/**
 * @class SmartPluginSettingsTab
 * @extends PluginSettingTab
 */
export class SmartPluginSettingsTab extends PluginSettingTab {
  constructor(app, plugin, icon='smart-connections') {
    super(app, plugin, icon);
    this.plugin = plugin;
    this.header_container = null;
    this.plugin_container = null;
    this.global_settings_container = null;
    this.plugin?.env?.create_env_getter?.(this);
    if (!this.icon && icon) this.icon = icon;
    this.name = this.name.replace('Smart ', ' ');
    this.polyfill_icon();
  }
  async polyfill_icon() {
    let max_attempts = 100;
    while (!this.navEl?.querySelector('.vertical-tab-nav-item-icon') && max_attempts > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      max_attempts--;
    }
    if (this.icon && this.navEl.querySelector('.vertical-tab-nav-item-icon')) {
      const tab_item = this.navEl.querySelector('.vertical-tab-nav-item-icon');
      tab_item.style.display = 'flex';
    }
  }
  get smart_view() {
    return this.env?.smart_view;
  }

  async display() {
    await this.render();
  }

  async render() {
    this.containerEl.empty();
    render_pre_env_load(this);
    await this.env.constructor.wait_for({ loaded: true });
    this.prepare_layout();
    await this.render_header(this.header_container);
    await this.render_plugin_settings(this.plugin_container);
    await this.render_global_settings(this.global_settings_container);
  }


  prepare_layout() {
    this.smart_view.apply_style_sheet(styles);
    this.containerEl.empty();
    this.header_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-header' });
    this.plugin_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-main' });
    this.global_settings_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-env' });
    this.pro_plugins_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-pro-plugins' });
  }

  /**
   * @abstract
   */
  async render_header(container) {
  }

  /**
   * @abstract
   */
  async render_plugin_settings(container) { // eslint-disable-line no-unused-vars
    // To be implemented by subclasses.
  }

  async render_global_settings(container) {
    if (!container) return;
    container.empty?.();
    if (!this.env) return;
    if(this.env.is_pro) {
      const settings_item_div = container.createDiv({ cls: 'setting-item' });
      const info_div = settings_item_div.createDiv({ cls: 'setting-item-info' });
      info_div.createDiv({ cls: 'setting-item-name', text: 'Smart Environment' });
      info_div.createDiv({
        cls: 'setting-item-description',
        text: 'Manage global settings in the dedicated Smart Environment settings tab.',
      });
      const control_div = settings_item_div.createDiv({ cls: 'setting-item-control' });
      const button = control_div.createEl('button', { text: 'Open settings' });
      button.addEventListener('click', () => {
        this.app.setting.openTabById('smart-environment');
      });
    }else {
      const settings_smart_env = await this.render_component('settings_smart_env', this.env);
      if (settings_smart_env) container.appendChild(settings_smart_env);
    }
    const smart_plugins_settings = await this.render_component('pro_plugins_list', this.env);
    this.pro_plugins_container.empty?.();
    this.pro_plugins_container.appendChild(smart_plugins_settings);
  }

  async render_component(name, scope, params={}) {
    return await this.env.smart_components.render_component(name, scope, params);
  }

}


