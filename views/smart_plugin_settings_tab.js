import { PluginSettingTab } from 'obsidian';
import { wait_for_env_to_load } from '../utils/wait_for_env_to_load.js';
import { open_url_externally } from '../utils/open_url_externally.js';

const MORE_PLUGIN_LINKS = [
  {
    label: 'Quickly copy notes many notes to clipboard',
    url: 'https://obsidian.md/plugins?id=smart-context',
  },
  {
    label: 'Embed & bookmark chat threads to notes',
    url: 'https://obsidian.md/plugins?id=smart-chatgpt',
  },
  {
    label: 'Smart note generation with context + templates',
    url: 'https://obsidian.md/plugins?id=smart-templates',
  },
];

/**
 * @param {import('smart-view').SmartView} smart_view
 * @param {unknown} plugin
 * @param {(scope: unknown, url: string) => void} open_url
 * @returns {DocumentFragment|null}
 */
export function create_more_plugins_fragment(smart_view, plugin, open_url = open_url_externally) {
  if (!smart_view) return null;
  const html = [
    '<h2>More Smart Plugins</h2>',
    '<div class="smart-plugin-settings-tab__more-plugins">',
    ...MORE_PLUGIN_LINKS.map(({ label, url }) => `<button type="button" data-url="${url}">${label}</button>`),
    '</div>',
  ].join('');
  const fragment = smart_view.create_doc_fragment(html);
  const buttons = fragment?.querySelectorAll?.('[data-url]') || [];
  buttons.forEach((button) => {
    button.addEventListener?.('click', () => {
      const target_url = button.dataset?.url;
      if (target_url) open_url(plugin, target_url);
    });
  });
  return fragment;
}

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
    const more_plugins_fragment = create_more_plugins_fragment(this.smart_view, this.plugin);
    if (more_plugins_fragment) this.global_settings_container.appendChild(more_plugins_fragment);
    const supporter_callout = await this.render_component(
      'supporter_callout',
      this.plugin,
      {
        plugin_name: this.plugin.manifest.name
      }
    );
    if (supporter_callout) this.global_settings_container.appendChild(supporter_callout);
    const smart_plugins_settings = await this.render_component('smart_plugins', this.plugin);
    if (smart_plugins_settings) this.global_settings_container.appendChild(smart_plugins_settings);
    // BEGIN v2 replaces above
    const settings_smart_env = await this.env.smart_components.render_component('settings_smart_env', this.env);
    if (settings_smart_env) this.global_settings_container.appendChild(settings_smart_env);
  }

  async render_component(name, scope, params={}) {
    return await this.env?.render_component(name, scope, params);
  }

}
