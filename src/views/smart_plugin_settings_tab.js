import { PluginSettingTab } from 'obsidian';
import { wait_for_env_to_load } from '../../utils/wait_for_env_to_load.js';
import styles from './settings.css';

/**
 * @class SmartPluginSettingsTab
 * @extends PluginSettingTab
 */
export class SmartPluginSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.header_container = null;
    this.plugin_container = null;
    this.global_settings_container = null;
    this.plugin?.env?.create_env_getter?.(this);
    if(this.env.is_pro && !this.env_settings_tab) this.plugin.addSettingTab(new SmartEnvSettingTab(this.plugin.app, this.plugin));
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
  // Detect Existing Smart Environment Settings Tab
  get env_settings_tab() {
    const app = this.plugin.app || window.app;
    return app.setting.pluginTabs.find(t => t.id === 'smart-environment');
  }

}

export class SmartEnvSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.header_container = null;
    this.plugin_container = null;
    this.global_settings_container = null;
    this.plugin?.env?.create_env_getter?.(this);
    this.plugin = plugin;
    this.name = 'Smart Environment';
    if(this.env.is_pro) this.name += ' Pro';
    this.id = 'smart-environment';
  }
  get smart_view() {
    return this.env?.smart_view;
  }
  display() {
    this.render();
  }
  async render_component(name, scope, params={}) {
    return await this.env.smart_components.render_component(name, scope, params);
  }

  async render() {
    this.containerEl.empty();
    this.smart_view.apply_style_sheet(styles);
    render_pre_env_load(this);
    await this.env.constructor.wait_for({ loaded: true });
    this.containerEl.empty();
    this.header_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-header' });
    this.plugin_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-main' });
    this.pro_plugins_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-pro-plugins' });
    this.header_container.createEl('p', { text: 'Manage all global Smart Environment settings from one tab. These settings apply to all Smart Plugins.' });
    const settings_smart_env = await this.render_component('settings_smart_env', this.env);
    if (settings_smart_env) this.plugin_container.appendChild(settings_smart_env);
    const smart_plugins_settings = await this.render_component('pro_plugins_list', this.env);
    this.pro_plugins_container.empty?.();
    this.pro_plugins_container.appendChild(smart_plugins_settings);
  }

}

function render_pre_env_load(scope) {
  const container = scope.containerEl;
  const env = scope.env;
  if (env.state !== 'loaded') {
    if (env.state === 'loading') {
      container.createEl('p', { text: 'Smart Environment is loading…' });
    } else {
      container.createEl('p', { text: 'Smart Environment not yet initialized.' });
      const load_btn = container.createEl('button', { text: 'Load Smart Environment' });
      load_btn.addEventListener('click', async () => {
        load_btn.disabled = true;
        load_btn.textContent = 'Loading Smart Environment…';
        await env.load(true);
      });
    }
  }
}
