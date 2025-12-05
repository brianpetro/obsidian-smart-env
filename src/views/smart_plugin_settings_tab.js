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
    if (this.env.state !== 'loaded') {
      if(this.env.state === 'loading') {
        this.containerEl.createEl('p', { text: 'Smart Environment is loading…' });
      } else {
        this.containerEl.createEl('p', { text: 'Smart Environment not yet initialized.' });
        const load_btn = this.containerEl.createEl('button', { text: 'Load Smart Environment' });
        load_btn.addEventListener('click', async () => {
          load_btn.disabled = true;
          load_btn.textContent = 'Loading Smart Environment…';
          await this.env.load(true);
          this.render();
        });
        return;
      }
    }
    await wait_for_env_to_load(this);
    this.prepare_layout();
    await this.render_header(this.header_container);
    await this.render_plugin_settings(this.plugin_container);
    await this.render_global_settings();
  }

  prepare_layout() {
    this.smart_view.apply_style_sheet(styles);
    this.containerEl.empty();
    this.header_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-header' });
    this.plugin_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-main' });
    this.global_settings_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-env' });
    this.smart_plugins_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-pro-plugins' });
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

  async render_global_settings() {
    if (!this.global_settings_container) return;
    this.global_settings_container.empty?.();
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
      const button = control_div.createEl('button', { text: 'Show Smart Environment Settings' });
      button.addEventListener('click', () => {
        this.app.setting.openTabById('smart-environment');
      });
    }else {
      const settings_smart_env = await this.render_component('settings_smart_env', this.env);
      if (settings_smart_env) this.global_settings_container.appendChild(settings_smart_env);
    }
    const smart_plugins_settings = await this.render_component('smart_plugins', this.env);
    this.smart_plugins_container.empty?.();
    this.smart_plugins_container.appendChild(smart_plugins_settings);
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

/**
 * @class SmartChatSettingTab
 * @extends SmartPluginSettingsTab
 * @description
 * Obsidian Settings tab for "Smart Chat" plugin.
 * Renders settings using the plugin's `env.smart_view` instance
 * and the plugin's `settings_config` object, attaching the results
 * to the display container.
 */
export class SmartEnvSettingTab extends SmartPluginSettingsTab {
  /**
   * @param {import('obsidian').App} app - The current Obsidian app instance
   * @param {import('./main.js').default} plugin - The main plugin object
   */
  constructor(app, plugin) {
    super(app, plugin);
    /** @type {import('./main.js').default} */
    this.plugin = plugin;
    this.name = 'Smart Environment';
    if(this.env.is_pro && this.env.config.components.settings_env_pro) this.name += ' Pro';
    this.id = 'smart-environment';
  }
  async render_header(container) {
    // skip rendering Show Smart Environment Settings button
  }

  async render_plugin_settings(container) {
    container.createEl('p', { text: 'Manage all global Smart Environment settings from one tab. These settings apply to all Smart Plugins.' });
    if(this.env.is_pro && this.env.config.components.settings_env_pro) {
      const pro_settings = await this.render_component('settings_env_pro', this.env);
      container.appendChild(pro_settings);
    }
    const settings_smart_env = await this.render_component('settings_smart_env', this.env);
    if (settings_smart_env) container.appendChild(settings_smart_env);
  }

}
