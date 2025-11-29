import { SmartPluginSettingsTab } from '../../views/smart_plugin_settings_tab.js';

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
    if(this.is_pro) this.name += ' Pro';
    this.id = 'smart-environment';
  }
  get is_pro() {
    return !!this.env?.config?.components?.settings_env_pro;
  }
  async render_header(container) {
    // skip rendering Show Smart Environment Settings button
  }

  async render_plugin_settings(container) {
    const settings_smart_env = await this.render_component('settings_smart_env', this.env);
    if (settings_smart_env) container.appendChild(settings_smart_env);
    if(this.is_pro) {
      const pro_settings = await this.render_component('settings_env_pro', this.env);
      container.appendChild(pro_settings);
    }
  }

}

