import { requestUrl } from 'obsidian';
import {
  get_oauth_storage_prefix,
  get_smart_server_url,
} from '../../utils/smart_plugins.js';
import styles from './style.css';
import { compare_versions } from 'smart-environment/utils/compare_versions.js';

const SMART_PLUGINS_DESC = `<a href="https://smartconnections.app/core-plugins/" target="_external">Core plugins</a> provide essential functionality and a "just works" experience. <a href="https://smartconnections.app/pro-plugins/" target="_external">Pro plugins</a> enable advanced configuration and features for Obsidian AI experts.`;
const PRO_PLUGINS_FOOTER = `All Pro plugins include advanced configurations and additional model providers. Pro users get priority support via email. <a href="https://smartconnections.app/introducing-pro-plugins/" target="_external">Learn more</a> about Pro plugins.`;

function default_smart_plugins_list() {
  return [
    {
      item_type: 'core',
      install_type: 'obsidian',
      item_name: 'Smart Connections',
      item_desc: 'See notes related to what you are working on right now.',
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
      install_type: 'obsidian',
      item_name: 'Smart Context',
      item_desc: 'Assemble notes into AI-ready context with selectors, links, and templates.',
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
      install_type: 'obsidian',
      item_name: 'Smart Chat',
      item_desc: 'Run chat workflows in Obsidian with Smart Environment context.',
      plugin_id: 'smart-chatgpt',
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
      plugin_id: 'smart-lookup',
      url: 'https://smartconnections.app/smart-lookup/',
      install_type: 'github',
      item_repo: 'brianpetro/smart-lookup-obsidian',
    },
    {
      item_type: 'core',
      install_type: 'obsidian',
      item_name: 'Smart Templates',
      item_desc: 'Create structured templates designed for Smart Plugins workflows.',
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
          <div class="setting-item-name pro-heading">Smart Plugins</div>
          <div class="setting-item-control">
            <div class="smart-plugins-login"></div>
          </div>
        </div>
        <p>${SMART_PLUGINS_DESC}</p>
        <div class="smart-plugins-section">
          <div class="setting-item-name smart-plugins-section-title">Official plugins</div>
          <div class="setting-items smart-plugins-official-list"></div>
        </div>
        <div class="smart-plugins-section">
          <div class="setting-item-name smart-plugins-section-title">Community plugins</div>
          <div class="setting-items smart-plugins-community-list"></div>
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
  const community_list_el = container.querySelector('.smart-plugins-community-list');

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

  const render_smart_plugins = async () => {
    this.empty(official_list_el);
    this.empty(community_list_el);

    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
    await render_login();
    await render_referrals(token);

    try {
      await app.plugins.loadManifests();
      const resp = await fetch_server_plugin_list(token);
      const { sub_exp = null } = resp || {};

      await render_login(sub_exp);
      await render_referrals(token, sub_exp);

      hydrate_plugins_list(resp, app);
      console.log('Hydrated plugin list:', SMART_PLUGINS_LIST);
      const plugin_groups = annotate_plugin_groups(SMART_PLUGINS_LIST);
      console.log('Plugin groups:', plugin_groups);

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

      community_list_el.appendChild(this.create_doc_fragment('<div class="coming-soon"><p>Community plugins are coming soon!</p></div>'));
    } catch (err) {
      console.error('[smart-plugins:list] Failed to fetch plugin list:', err);
      this.empty(official_list_el);
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

function hydrate_plugins_list(server_resp, app) {
  SMART_PLUGINS_LIST = default_smart_plugins_list();

  const { list = [], sub_exp } = server_resp || {};
  const sub_active = Boolean(sub_exp && sub_exp > Date.now());

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

  const installed_plugins = Object.values(app.plugins.manifests || {});
  for (const installed_item of installed_plugins) {
    const matches = SMART_PLUGINS_LIST.filter((item) => item.plugin_id === installed_item.id);

    for (const match of matches) {
      match.manifest = installed_item;
    }
  }

  for (let i = 0; i < SMART_PLUGINS_LIST.length; i += 1) {
    SMART_PLUGINS_LIST[i] = new PluginListItem(app, SMART_PLUGINS_LIST[i], sub_active);
  }
}

export class PluginListItem {
  constructor(app, item, sub_active) {
    this.app = app;
    this.data = item;
    this.sub_active = sub_active;
    this.can_enable = this.is_installed && !this.is_enabled;
    this.group_size = 1;
    this.group_index = 0;
    this.group_state = 'single';
  }

  get plugin_id() {
    return this.data.plugin_id;
  }

  get is_enabled() {
    return this.app.plugins.enabledPlugins.has(this.plugin_id);
  }

  get can_install() {
    if (this.data.item_type === 'core') return true;
    if (this.data.item_type === 'pro') return this.sub_active;
    return false;
  }

  get should_update() {
    return Boolean(
      this.data.item_type === this.data.installed_type
      && typeof this.data.version === 'string'
      && this.data.version
      && compare_versions(this.data.version, this.data.installed_version) > 0
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
    return this.data.manifest.name.includes('Pro') ? 'pro' : 'core';
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

  get repo() {
    return this.data.item_repo || this.data.repo;
  }

  get label () {
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

  if (is_installed_group_state(pro_item.item_state)) return 'pro_installed';
  if (is_installed_group_state(core_item.item_state)) return 'core_installed';
  if (pro_item.item_state === 'can_install') return 'pro_can_install';
  if (core_item.item_state === 'can_install') return 'core_can_install';
  if (pro_item.item_state === 'cant_install') return 'core_can_install';
  return 'single';
}

function is_installed_group_state(item_state) {
  return [
    'installed',
    'can_enable',
    'update_available',
  ].includes(item_state);
}
