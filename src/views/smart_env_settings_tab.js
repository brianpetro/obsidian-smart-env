import { PluginSettingTab } from 'obsidian';
import { render_pre_env_load } from '../utils/render_pre_env_load';
import styles from './settings.css';


export class SmartEnvSettingTab extends PluginSettingTab {
  constructor(app, plugin, icon='smart-connections') {
    super(app, plugin, icon);
    this.plugin = plugin;
    this.header_container = null;
    this.plugin_container = null;
    this.global_settings_container = null;
    this.plugin?.env?.create_env_getter?.(this);
    this.plugin = plugin;
    this.name = '  Smart Environment';
    this.id = 'smart-environment';
    if (!this.icon && icon) this.icon = icon;
    this.smart_view.apply_style_sheet(styles);
  }
  get smart_view() {
    return this.env?.smart_view;
  }
  display() {
    this.render();
  }
  async render_component(name, scope, params = {}) {
    return await this.env.smart_components.render_component(name, scope, params);
  }

  async render() {
    this.containerEl.empty();
    // this.smart_view.apply_style_sheet(styles); // moved to constructor
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
