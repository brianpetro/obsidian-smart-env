import { requestUrl } from 'obsidian';
import {
  enable_plugin,
  fetch_plugin_file,
  get_oauth_storage_prefix,
  get_response_header_value,
  get_smart_server_url,
  write_files_with_adapter,
} from '../../utils/smart_plugins.js';
import styles from './style.css';
import { compare_versions } from 'smart-environment/utils/compare_versions.js';
import { convert_to_time_ago } from 'smart-utils/convert_to_time_ago.js';
import { convert_to_time_until } from 'smart-utils/convert_to_time_until.js';

const SMART_PLUGINS_DESC = `<a href="https://smartconnections.app/core-plugins/?utm_source=plugin-store" target="_external">Core plugins</a> provide essential functionality and a "just works" experience. Pro plugins enable advanced configuration and features for Obsidian AI experts. <a href="https://smartconnections.app/smart-plugins/?utm_source=plugin-store" target="_external">Learn more</a> about Smart Plugins.`;
const PRO_PLUGINS_FOOTER = `All Pro plugins include advanced configurations and additional model providers. Pro users get priority support via email. <a href="https://smartconnections.app/pro-plugins/?utm_source=plugin-store" target="_external">Learn more</a> about Pro Plugins.`;
const PRO_PLUGINS_URL = 'https://smartconnections.app/pro-plugins/';
const OBSIDIAN_PLUGIN_URL = 'https://obsidian.md/plugins?id=';
const install_file_names = ['manifest.json', 'main.js', 'styles.css'];

function default_smart_plugins_list() {
  return [
    {
      item_type: 'core',
      install_method: 'obsidian',
      item_name: 'Smart Connections',
      item_desc: 'See notes related to what you are working on right now.',
      item_repo: 'brianpetro/obsidian-smart-connections',
      plugin_id: 'smart-connections',
      url: 'https://smartconnections.app/smart-connections/',
    },
    {
      item_type: 'pro',
      item_name: 'Connections Pro',
      plugin_id: 'smart-connections',
      item_desc: 'More opportunities for connections. Graph view for visualizing. Inline and footer views (great for mobile!). Configurable algorithms and additional embedding model providers.',
      url: 'https://smartconnections.app/smart-connections/',
    },
    {
      item_type: 'core',
      install_method: 'obsidian',
      item_name: 'Smart Context',
      item_desc: 'Assemble notes into AI-ready context with selectors, links, and templates.',
      item_repo: 'brianpetro/smart-context-obsidian',
      plugin_id: 'smart-context',
      url: 'https://smartconnections.app/smart-context/',
    },
    {
      item_type: 'pro',
      item_name: 'Context Pro',
      plugin_id: 'smart-context',
      item_desc: 'Advanced tools for context engineering. Utilize Bases, images, and external sources (great for coders!) in your contexts.',
      url: 'https://smartconnections.app/smart-context/',
    },
    {
      item_type: 'core',
      install_method: 'obsidian',
      item_name: 'Smart Chat',
      item_desc: 'Run chat workflows in Obsidian with Smart Environment context.',
      plugin_id: 'smart-chatgpt',
      item_repo: 'brianpetro/smart-chatgpt-obsidian',
      url: 'https://smartconnections.app/smart-chat/',
    },
    {
      item_type: 'pro',
      item_name: 'Chat Pro (API)',
      plugin_id: 'smart-chat',
      item_desc: 'Configure chat to use Local and Cloud API providers (Ollama, LM Studio, OpenAI, Gemini, Anthropic, Open Router, and more).',
      url: 'https://smartconnections.app/smart-chat/',
    },
    {
      item_type: 'core',
      item_name: 'Smart Lookup',
      item_desc: 'Run semantic search as a dedicated Smart Plugin.',
      item_repo: 'brianpetro/smart-lookup-obsidian',
      plugin_id: 'smart-lookup',
      url: 'https://smartconnections.app/smart-lookup/',
      install_method: 'github',
    },
    {
      item_type: 'core',
      install_method: 'obsidian',
      item_name: 'Smart Templates',
      item_desc: 'Create structured templates designed for Smart Plugins workflows.',
      item_repo: 'brianpetro/obsidian-smart-templates',
      plugin_id: 'smart-templates',
      url: 'https://smartconnections.app/smart-templates/',
    },
    {
      item_type: 'pro',
      item_name: 'Connect Pro',
      plugin_id: 'smart-connect-pro',
      item_desc: 'Integrate with ChatGPT. Use a GPT that has access to Obsidian CLI.',
      url: 'https://smartconnections.app/connect-pro/',
    },
  ];
}
let SMART_PLUGINS_LIST = default_smart_plugins_list();

export function build_html(env, params = {}) {
  return `
    <div class="pro-plugins-container setting-item-heading">
      <div class="setting-group">
        <div class="setting-item setting-item-heading">
          <div class="setting-item-control">
            <div class="smart-plugins-login"></div>
          </div>
        </div>
        <p>${SMART_PLUGINS_DESC}</p>
        <div class="smart-plugins-server-message" style="display:none;"></div>
        <div class="smart-plugins-section">
          <div class="smart-plugins-official-list">Loading...</div>
        </div>
        <p>${PRO_PLUGINS_FOOTER}</p>
        <div class="smart-plugins-referral"></div>
      </div>
    </div>
  `;
}

export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const html = build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}

export async function post_process(env, container, params = {}) {
  const plugin = env.plugin || null;
  const app = plugin?.app || window.app;
  const oauth_storage_prefix = get_oauth_storage_prefix(app);

  const login_container = container.querySelector('.smart-plugins-login');
  const referral_container = container.querySelector('.smart-plugins-referral');
  const official_list_el = container.querySelector('.smart-plugins-official-list');
  const server_message_el = container.querySelector('.smart-plugins-server-message');

  const render_component = env.smart_components.render_component.bind(env.smart_components);
  const render_login = async (sub_exp = null) => {
    const login_el = await render_component('smart_plugins_login', env, { ...params, sub_exp });
    this.empty(login_container);
    if (login_el) login_container.appendChild(login_el);
  };
  const render_referrals = async (token, sub_exp = null) => {
    const referral_el = await render_component('smart_plugins_referral', env, { ...params, token, sub_exp });
    this.empty(referral_container);
    if (referral_el) referral_container.appendChild(referral_el);
  };
  const render_server_message = (message = '') => {
    const safe_message = String(message || '').trim();
    this.empty(server_message_el);
    if (!safe_message) {
      server_message_el.style.display = 'none';
      return;
    }
    server_message_el.style.display = '';
    server_message_el.textContent = safe_message;
  };

  const render_smart_plugins = async () => {
    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
    await render_login();
    await render_referrals(token);
    render_server_message('');

    try {
      await app.plugins.loadManifests();
      const resp = await fetch_server_plugin_list(token);
      const {
        sub_exp = null,
        message = '',
      } = resp || {};

      await render_login(sub_exp);
      await render_referrals(token, sub_exp);
      render_server_message(message);

      hydrate_plugins_list(resp, env, {
        root_sub_exp: sub_exp,
      });
      console.log('Hydrated plugin list:', SMART_PLUGINS_LIST);
      const plugin_groups = annotate_plugin_groups(SMART_PLUGINS_LIST);
      console.log('Plugin groups:', plugin_groups);

      this.empty(official_list_el);
      for (const plugin_group of plugin_groups) {
        const group_frag = this.create_doc_fragment(`<div class="setting-group smart-plugins-item-group" data-group-size="${plugin_group.items.length}" data-group-state="${plugin_group.group_state}"><div class="setting-items"></div></div>`);
        const group_el = group_frag.firstElementChild;
        const group_items_el = group_el.querySelector('.setting-items');
        official_list_el.appendChild(group_el);

        for (const item of plugin_group.items) {
          const row = await render_component('smart_plugins_list_item', item, {
            ...params,
            app,
            env,
            token,
            sub_exp,
            group_items: plugin_group.items,
            group_state: plugin_group.group_state,
          });
          if (row) group_items_el.appendChild(row);
        }
      }

      // TODO: added Evan's visualizer plugins in community section

    } catch (err) {
      console.error('[smart-plugins:list] Failed to fetch plugin list:', err);
      this.empty(official_list_el);
      render_server_message('');
      official_list_el.appendChild(this.create_doc_fragment('<div class="error"><p>Failed to load plugin information.</p><button class="retry">Retry</button></div>'));
      SMART_PLUGINS_LIST = default_smart_plugins_list();
      const retry_button = official_list_el.querySelector('.retry');
      if (retry_button) {
        retry_button.addEventListener('click', render_smart_plugins);
      }
    }
  };

  const disposers = [];
  disposers.push(env.events.on('smart_plugins_oauth_completed', render_smart_plugins));
  disposers.push(env.events.on('pro_plugins:logged_out', render_smart_plugins));
  disposers.push(env.events.on('pro_plugins:refresh', render_smart_plugins));
  this.attach_disposer?.(container, disposers);

  await render_smart_plugins();
  return container;
}

async function fetch_server_plugin_list(token) {
  const resp = await requestUrl({
    url: `${get_smart_server_url()}/plugin_list`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({}),
    throw: false,
  });
  console.log('Plugin list server response:', resp);

  if (resp.status !== 200) {
    return { list: [], sub_exp: null };
  }
  return resp.json;
}

function normalize_positive_epoch_ms(value) {
  const numeric_value = Number(value);
  if (!Number.isFinite(numeric_value) || numeric_value <= 0) {
    return null;
  }
  return Math.round(numeric_value);
}

function get_plugin_file_text(response, file_name) {
  if (typeof response?.text === 'string' && response.text.length) {
    return response.text;
  }

  if (response?.arrayBuffer instanceof ArrayBuffer) {
    return new TextDecoder('utf-8').decode(response.arrayBuffer);
  }

  if (file_name === 'manifest.json' && response?.json) {
    return JSON.stringify(response.json, null, 2);
  }

  return '';
}

function build_plugin_file_record(file_name, response) {
  return {
    fileName: file_name,
    data: new TextEncoder().encode(get_plugin_file_text(response, file_name)),
    accessed_at: normalize_positive_epoch_ms(
      get_response_header_value(response, 'accessed_at')
    ),
  };
}

function hydrate_plugins_list(server_resp, env, params = {}) {
  SMART_PLUGINS_LIST = default_smart_plugins_list();

  const { list = [] } = server_resp || {};

  for (const server_item of list) {
    const server_item_type = server_item.item_type || 'pro';
    const local_item = SMART_PLUGINS_LIST.find((item) => {
      return item.plugin_id === server_item.plugin_id
        && item.item_type === server_item_type
      ;
    });

    if (!local_item) {
      SMART_PLUGINS_LIST.push({
        item_type: server_item_type,
        ...server_item,
      });
      continue;
    }

    Object.assign(local_item, server_item, {
      item_type: server_item_type,
    });
  }

  const installed_plugins = Object.values(env.obsidian_app.plugins.manifests || {});
  for (const installed_item of installed_plugins) {
    const matches = SMART_PLUGINS_LIST.filter((item) => item.plugin_id === installed_item.id);

    for (const match of matches) {
      match.manifest = installed_item;
    }
  }

  for (let i = 0; i < SMART_PLUGINS_LIST.length; i += 1) {
    SMART_PLUGINS_LIST[i] = new PluginListItem(env, SMART_PLUGINS_LIST[i], {
      root_sub_exp: params.root_sub_exp,
    });
  }
}

export class PluginListItem {
  constructor(env, item, params = {}) {
    this.env = env;
    this.app = env.obsidian_app;
    this.data = item;
    this.root_sub_exp = normalize_positive_epoch_ms(params.root_sub_exp);
    this.group_size = 1;
    this.group_index = 0;
    this.group_state = 'single';
  }

  get auth_token() {
    const oauth_storage_prefix = get_oauth_storage_prefix(this.app);
    return localStorage.getItem(oauth_storage_prefix + 'token') || '';
  }

  get plugin_id() {
    return this.data.plugin_id;
  }

  get is_enabled() {
    return this.app.plugins.enabledPlugins.has(this.plugin_id);
  }

  get env_plugin_state() {
    return this.env?.plugin_states?.[this.plugin_id] || null;
  }

  get is_deferred() {
    return this.installed_type === this.item_type
      && this.is_enabled
      && (
        this.env_plugin_state === 'deferred'
        || this.loaded_version !== this.installed_version
      );
  }

  get is_entitled() {
    return this.data.entitled === true;
  }

  get item_sub_exp() {
    return normalize_positive_epoch_ms(this.data.sub_exp);
  }

  get should_show_item_subscription_state() {
    return this.item_type === 'pro'
      && this.root_sub_exp === null
      && this.item_sub_exp !== null
    ;
  }

  get subscription_status_text() {
    if (!this.should_show_item_subscription_state) {
      return '';
    }

    if (this.item_sub_exp < Date.now()) {
      return `Subscription expired ${convert_to_time_ago(this.item_sub_exp)}.`;
    }

    return `Subscription active, renews ${convert_to_time_until(this.item_sub_exp)}.`;
  }

  get can_install() {
    if (this.data.item_type === 'core') return true;
    if (this.data.item_type === 'pro') return this.is_entitled;
    return false;
  }

  get should_update() {
    if (this.item_type !== this.installed_type) return false;
    if (this.can_install && this.is_enabled && !this.is_loaded && !this.is_deferred) {
      // check if outdated SmartEnv version
      const env_version = this.app.plugins.plugins[this.plugin_id]?.SmartEnv.version;
      if (env_version) {
        const env_version_minor = parseInt(env_version.split('.')[1] || '0');
        if (env_version_minor < 4) return true; // incompatible smart env version, requires update
      }
    }
    return Boolean(
      this.item_type === this.installed_type
      && typeof this.data.version === 'string'
      && this.data.version
      && compare_versions(this.data.version, this.installed_version) > 0
    );
  }

  get is_installed() {
    return this.installed_type === this.item_type;
  }

  get item_type() {
    return this.data.item_type || 'pro';
  }

  get installed_type() {
    if (!this.data.manifest) return null;
    if (['smart-file-nav'].includes(this.plugin_id)) return 'pro'; // TEMP special case for plugins that don't follow standard naming conventions
    return this.data.manifest.name.includes('Pro') ? 'pro' : 'core';
  }

  get loaded_version() {
    return this.app.plugins.plugins[this.plugin_id]?.manifest?.version;
  }

  get installed_version() {
    if (!this.data.manifest) return null;
    return this.data.manifest.version || null;
  }

  get state() {
    if (this.should_update) return 'update_available';
    if (this.installed_type === this.item_type) {
      if (!this.is_enabled) return 'can_enable';
      return 'installed';
    }

    if (this.item_type === 'core') {
      if (this.installed_type === 'pro') return 'pro_installed';
      return 'can_install';
    }

    if (this.installed_type === 'core') return 'core_installed';
    if (this.can_install) return 'can_install';
    return 'cant_install';
  }

  get install_method() {
    return this.data.install_method || 'server';
  }

  get repo() {
    return this.data.item_repo || this.data.repo;
  }

  get label() {
    return this.data.item_name || this.data.name || this.data.plugin_id || this.data.repo || 'plugin';
  }

  get name() {
    return this.data.item_name || this.data.name || this.data.plugin_id || '';
  }

  get formatted_name() {
    return this.name
      .replace(/\bSmart\s+/g, '')
      .replace(/\bPro\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    ;
  }

  get description() {
    return this.data.item_desc || this.data.description || '';
  }

  get formatted_description() {
    return this.description;
  }

  get is_loaded() {
    if (this.installed_type !== this.item_type) return false;
    return this.is_enabled && (
      this.env.plugin_states?.[this.plugin_id] === 'loaded'
      || ['smart-file-nav'].includes(this.plugin_id) // TEMP special case for plugins that don't use SmartEnv
    );
  }

  get row_control_state() {
    if (this.should_update) return 'update_available';
    if (this.is_deferred) return 'deferred';
    if (this.is_loaded) return 'loaded';

    if (this.group_size > 1) {
      if (this.group_state === 'pro_can_install') {
        if (this.item_type === 'core' && this.state === 'can_install') {
          return 'included_in_pro';
        }
        if (this.item_type === 'pro' && this.state === 'can_install') {
          return 'can_install_pro';
        }
      }

      if (this.group_state === 'core_can_install') {
        if (this.item_type === 'core' && this.state === 'can_install') {
          return 'can_install_core_only';
        }
      }
    }

    if (this.item_type === 'pro' && this.state === 'can_install') {
      return 'can_install_pro';
    }

    return this.state || 'can_install';
  }

  get control_specs() {
    switch (this.row_control_state) {
      case 'deferred':
        const is_updated = this.loaded_version && this.loaded_version !== this.installed_version;
        return [
          { type: 'status', text: `${is_updated ? 'Update ready.' : 'Installed & enabled.'} Reload to activate` },
          { type: 'button', action: 'restart_obsidian', text: 'Reload', variant: 'primary' },
        ];
      case 'update_available':
        return [
          { type: 'status', text: 'Update available' },
          { type: 'button', action: 'install', text: 'Update', variant: 'primary' },
        ];
      case 'loaded':
        return [
          { type: 'status', text: 'Active' },
          { type: 'button', action: 'open_settings', text: 'Open settings', variant: 'secondary' },
        ];
      case 'can_enable':
        return [
          { type: 'button', action: 'enable', text: 'Enable', variant: 'primary' },
        ];
      case 'pro_installed':
        return [
          { type: 'status', text: 'Pro installed' },
        ];
      case 'included_in_pro':
        return [
          { type: 'status', text: 'Included in Pro' },
        ];
      case 'core_installed':
        return [
          { type: 'status', text: 'Core installed' },
          ...(this.can_install
            ? [{ type: 'button', action: 'install', text: 'Install Pro', variant: 'primary' }]
            : []),
          { type: 'button', action: 'learn_more', text: 'Learn more', variant: 'secondary' },
        ];
      case 'can_install_core_only':
        return [
          { type: 'button', action: 'install', text: 'Install Core', variant: 'primary' },
        ];
      case 'can_install_pro':
        return [
          { type: 'button', action: 'install', text: 'Install Pro', variant: 'primary' },
          { type: 'button', action: 'learn_more', text: 'Learn more', variant: 'secondary' },
        ];
      case 'cant_install':
        return [
          { type: 'button', action: 'learn_more', text: 'Learn more', variant: 'secondary' },
        ];
      case 'can_install':
      default:
        return [
          { type: 'button', action: 'install', text: 'Install', variant: 'primary' },
          { type: 'button', action: 'learn_more', text: 'Learn more', variant: 'secondary' },
        ];
    }
  }

  get_busy_text(action) {
    switch (action) {
      case 'install':
        return this.should_update ? 'Updating…' : 'Installing…';
      case 'enable':
        return 'Enabling…';
      default:
        return '';
    }
  }

  async handle_action(action, params = {}) {
    switch (action) {
      case 'install':
        await this.install(params);
        return;
      case 'enable':
        await this.enable(params);
        return;
      case 'restart_obsidian':
        this.restart_obsidian();
        return;
      case 'open_settings':
        this.open_settings();
        return;
      case 'learn_more':
        this.open_plugin_url();
        return;
      default:
        return;
    }
  }

  async install(params = {}) {
    if (this.item_type === 'core') {
      if (this.install_method === 'github') {
        await this.install_github_release_plugin(params);
        return;
      }

      this.install_core_plugin();
      return;
    }

    await this.install_plugin(params);
  }

  async enable(params = {}) {
    try {
      await enable_plugin(this.app, this.plugin_id);
      this.env?.events?.emit?.('pro_plugins:enabled', {
        level: 'info',
        message: `${this.label} enabled.`,
        event_source: 'browse_smart_plugins.list_item',
      });
      this.env?.events?.emit?.('pro_plugins:refresh', {
        event_source: 'browse_smart_plugins.list_item.enable',
      });
    } catch (err) {
      console.error('[smart-plugins:list] Enable error:', err);
      this.env?.events?.emit?.('pro_plugins:enable_failed', {
        level: 'error',
        message: `Enable failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item',
      });
    }
  }

  restart_obsidian() {
    if (typeof this.app?.commands?.executeCommandById === 'function') {
      this.app.commands.executeCommandById('app:reload');
      return;
    }
    window.location.reload();
  }

  open_settings() {
    this.app.setting.open();
    this.app.setting.openTabById(this.plugin_id);
  }

  open_plugin_url() {
    const url = with_utm_source(this.data.url || PRO_PLUGINS_URL, 'plugin-store');
    window.open(url, '_external');
  }

  open_community_index_page() {
    window.open(`${OBSIDIAN_PLUGIN_URL}${encodeURIComponent(this.plugin_id)}`, '_external');
  }

  async install_core_plugin() {
    try {
      const { json: release } = await this.get_latest_github_release();
      const version = release?.tag_name;
      await this.app.plugins.installPlugin(this.repo, version, {
        id: this.plugin_id,
        name: this.label,
      });
      await this.enable();
      this.env?.events?.emit?.('smart_plugins:install_completed', {
        level: 'attention',
        message: `${this.label} installed successfully.`,
        event_source: 'browse_smart_plugins.list_item',
      });
      this.env?.events?.emit?.('pro_plugins:refresh', {
        event_source: 'browse_smart_plugins.list_item.core_install',
      });
    } catch (err) {
      console.error('[smart-plugins:list] Core install error:', err);
      this.env?.events?.emit?.('smart_plugins:install_failed', {
        level: 'error',
        message: `Install failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item',
      });
    }
  }

  async download_plugin_files() {
    if (!this.auth_token) {
      throw new Error('Login required to install this plugin.');
    }

    const version = String(this.data?.version || '').trim() || null;
    const files = [];

    for (const file_name of install_file_names) {
      const response = await fetch_plugin_file(this.repo, this.auth_token, {
        file: file_name,
        version,
      });
      files.push(build_plugin_file_record(file_name, response));
    }

    return files;
  }

  async install_plugin(params = {}) {
    try {
      this.env?.events?.emit?.('pro_plugins:install_started', {
        level: 'info',
        message: `Installing "${this.label}" ...`,
        event_source: 'browse_smart_plugins.list_item',
      });

      const files = await this.download_plugin_files();
      const folder_name = String(this.plugin_id || '').trim();
      if (!folder_name) {
        throw new Error(`Missing plugin id for "${this.label}".`);
      }

      const base_folder = `${this.app.vault.configDir}/plugins/${folder_name}`;
      await write_files_with_adapter(this.app.vault.adapter, base_folder, files);

      await this.app.plugins.loadManifests();

      if (this.app.plugins.enabledPlugins.has(this.plugin_id)) {
        await this.app.plugins.disablePlugin(this.plugin_id);
      }
      await enable_plugin(this.app, this.plugin_id);

      this.env?.events?.emit?.('pro_plugins:install_completed', {
        level: 'attention',
        message: `${this.label} installed successfully.`,
        event_source: 'browse_smart_plugins.list_item',
      });
      this.env?.events?.emit?.('pro_plugins:refresh', {
        event_source: 'browse_smart_plugins.list_item.install',
      });
      if (typeof params.on_installed === 'function') {
        await params.on_installed();
      }
    } catch (err) {
      console.error('[smart-plugins:list] Install error:', err);
      this.env?.events?.emit?.('pro_plugins:install_failed', {
        level: 'error',
        message: `Install failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item',
      });
    }
  }

  async install_github_release_plugin(params = {}) {
    const app = params.app || this.app;
    const env = params.env || null;

    if (!this.repo) {
      throw new Error(`Missing GitHub repo for "${this.label}".`);
    }
    if (!this.plugin_id) {
      throw new Error(`Missing plugin id for "${this.label}".`);
    }

    try {
      env?.events?.emit?.('pro_plugins:install_started', {
        level: 'info',
        message: `Installing "${this.label}" ...`,
        event_source: 'browse_smart_plugins.list_item',
      });

      const { json: release } = await this.get_latest_github_release();

      const assets = release?.assets || [];
      const main_asset = assets.find((asset) => asset.name === 'main.js');
      const manifest_asset = assets.find((asset) => asset.name === 'manifest.json');
      const styles_asset = assets.find((asset) => asset.name === 'styles.css');

      if (!main_asset || !manifest_asset || !styles_asset) {
        throw new Error('Failed to find necessary assets in the latest GitHub release.');
      }

      const plugin_folder = `${app.vault.configDir}/plugins/${this.plugin_id}`;
      if (!await app.vault.adapter.exists(plugin_folder)) {
        await app.vault.adapter.mkdir(plugin_folder);
      }

      await Promise.all([
        this.download_and_write_release_asset(app, main_asset.browser_download_url, `${plugin_folder}/main.js`),
        this.download_and_write_release_asset(app, manifest_asset.browser_download_url, `${plugin_folder}/manifest.json`),
        this.download_and_write_release_asset(app, styles_asset.browser_download_url, `${plugin_folder}/styles.css`),
      ]);

      await app.plugins.loadManifests();
      if (app.plugins.enabledPlugins.has(this.plugin_id)) {
        await app.plugins.disablePlugin(this.plugin_id);
      }
      await enable_plugin(app, this.plugin_id);

      env?.events?.emit?.('pro_plugins:install_completed', {
        level: 'attention',
        message: `${this.label} installed successfully.`,
        event_source: 'browse_smart_plugins.list_item',
      });
      env?.events?.emit?.('pro_plugins:refresh', {
        event_source: 'browse_smart_plugins.list_item.install_github_release_plugin',
      });
      if (typeof params.on_installed === 'function') {
        await params.on_installed();
      }
    } catch (err) {
      console.error('[smart-plugins:list] GitHub install error:', err);
      env?.events?.emit?.('pro_plugins:install_failed', {
        level: 'error',
        message: `Install failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item.install_github_release_plugin',
      });
    }
  }

  async get_latest_github_release() {
    return await requestUrl({
      url: `https://api.github.com/repos/${this.repo}/releases/latest`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      contentType: 'application/json',
    });
  }

  async download_and_write_release_asset(app, download_url, output_path) {
    const resp = await requestUrl({
      url: download_url,
      method: 'GET',
    });
    await app.vault.adapter.write(output_path, resp.text);
  }
}

function annotate_plugin_groups(items = []) {
  const plugin_groups = build_plugin_groups(items);

  for (const plugin_group of plugin_groups) {
    for (let i = 0; i < plugin_group.items.length; i += 1) {
      const item = plugin_group.items[i];
      item.group_size = plugin_group.items.length;
      item.group_index = i;
      item.group_state = plugin_group.group_state;
    }
  }

  return plugin_groups;
}

function build_plugin_groups(items = []) {
  const plugin_groups = [];
  let current_group = null;

  for (const item of items) {
    const group_key = get_plugin_group_key(item);
    if (!current_group || current_group.group_key !== group_key) {
      current_group = {
        group_key,
        items: [],
        group_state: 'single',
      };
      plugin_groups.push(current_group);
    }
    current_group.items.push(item);
  }

  for (const plugin_group of plugin_groups) {
    plugin_group.group_state = resolve_group_state(plugin_group.items);
  }

  return plugin_groups;
}

function get_plugin_group_key(item) {
  return item.plugin_id || `${item.item_type}:${item.item_name || item.name || ''}`;
}

function resolve_group_state(group_items = []) {
  if (!Array.isArray(group_items) || group_items.length < 2) return 'single';

  const core_item = group_items.find((item) => item.item_type === 'core');
  const pro_item = group_items.find((item) => item.item_type === 'pro');
  if (!core_item || !pro_item) return 'single';

  if (is_installed_group_state(pro_item.state)) return 'pro_installed';
  if (is_installed_group_state(core_item.state)) return 'core_installed';
  if (pro_item.state === 'can_install') return 'pro_can_install';
  if (core_item.state === 'can_install') return 'core_can_install';
  if (pro_item.state === 'cant_install') return 'core_can_install';
  return 'single';
}

function is_installed_group_state(item_state) {
  return [
    'installed',
    'can_enable',
    'update_available',
  ].includes(item_state);
}

function with_utm_source(url, source) {
  if (!url) return PRO_PLUGINS_URL;
  return url.includes('?')
    ? `${url}&utm_source=${source}`
    : `${url}?utm_source=${source}`
  ;
}
