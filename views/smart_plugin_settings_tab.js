import { PluginSettingTab } from 'obsidian';
import { wait_for_env_to_load } from '../utils/wait_for_env_to_load.js';

/**
 * @class SmartPluginSettingsTab
 * @extends PluginSettingTab
 */
export class SmartPluginSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.plugin_container = null;
    this.global_settings_container = null;
    this.plugin?.env?.create_env_getter?.(this);
  }

  get smart_view() {
    return this.env?.smart_view;
  }

  async display() {
    await this.render();
  }

  async render() {
    this.containerEl.empty();
    if (!this.env) {
      this.containerEl.createEl('p', { text: 'Smart Environment not yet initialized.' });
      return;
    }
    await wait_for_env_to_load(this);
    this.prepare_layout();
    await this.render_plugin_settings(this.plugin_container);
    await this.render_global_settings();
  }

  prepare_layout() {
    this.containerEl.empty();
    this.plugin_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-tab__plugin' });
    this.global_settings_container = this.containerEl.createDiv({
      cls: 'smart-plugin-settings-tab__global',
      attr: { 'data-smart-settings': 'env' },
    });
  }

  async render_plugin_settings(container) { // eslint-disable-line no-unused-vars
    // To be implemented by subclasses.
  }

  async render_global_settings() {
    if (!this.global_settings_container) return;
    this.global_settings_container.empty?.();
    if (!this.env) return;
    const settings_smart_env = await this.render_component('settings_smart_env', this.env);
    if (settings_smart_env) this.global_settings_container.appendChild(settings_smart_env);
    if(this.env.config.components.settings_env_pro) {
      const pro_settings = await this.render_component('settings_env_pro', this.env);
      this.global_settings_container.appendChild(pro_settings);
    }
    // const supporter_callout = await this.render_component(
    //   'supporter_callout',
    //   this.plugin,
    //   {
    //     plugin_name: this.plugin.manifest.name
    //   }
    // );
    // if (supporter_callout) this.global_settings_container.appendChild(supporter_callout);
    const smart_plugins_settings = await this.render_component('smart_plugins', this.env);
    this.global_settings_container.appendChild(smart_plugins_settings);
  }

  async render_component(name, scope, params={}) {
    return await this.env.smart_components.render_component(name, scope, params);
  }

}
