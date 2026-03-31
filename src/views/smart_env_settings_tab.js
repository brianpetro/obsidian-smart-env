import { PluginSettingTab } from 'obsidian';
import { render_pre_env_load } from '../utils/render_pre_env_load.js';
import { render_plugin_store_setting } from '../utils/render_plugin_store_setting.js';
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
    if(!this.env || ['init', 'loading'].includes(this.env.state)) {
      render_pre_env_load(this);
      await this.env.constructor.wait_for({ loaded: true });
    }
    // this.smart_view.apply_style_sheet(styles); // moved to constructor
    this.containerEl.empty();
    if (Object.values(this.env.plugin_states).some(state => state === 'deferred')) {
      this.containerEl.createDiv({ text: 'Smart Plugins are waiting to be loaded. Restart Obsidian to finish loading the Smart Environment.' });
      const button = this.containerEl.createEl('button', { text: 'Restart Obsidian' });
      button.addEventListener('click', () => {
        window.location.reload();
      });
    }
    this.header_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-header' });
    this.plugin_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-main' });
    this.pro_plugins_container = this.containerEl.createDiv({ cls: 'smart-plugin-settings-pro-plugins' });
    this.header_container.createEl('p', { text: 'Manage all global Smart Environment settings from one tab. These settings apply to all Smart Plugins.' });
    const settings_smart_env = await this.render_component('settings_smart_env', this.env);
    if (settings_smart_env) this.plugin_container.appendChild(settings_smart_env);
    render_plugin_store_setting(this, this.pro_plugins_container);
  }

}
