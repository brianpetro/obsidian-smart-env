import { requestUrl } from 'obsidian';
import {
  get_oauth_storage_prefix,
  get_smart_server_url,
  // fetch_server_plugin_list,
} from '../../utils/smart_plugins.js';
import styles from './style.css';
import { compare_versions } from 'smart-environment/utils/compare_versions.js';

const SMART_PLUGINS_DESC = `<a href="https://smartconnections.app/core-plugins/" target="_external">Core plugins</a> provide essential functionality and a "just works" experience. <a href="https://smartconnections.app/pro-plugins/" target="_external">Pro plugins</a> enable advanced configuration and features for Obsidian AI experts.`;
const PRO_PLUGINS_FOOTER = `All Pro plugins include advanced configurations and additional model providers. Pro users get priority support via email. <a href="https://smartconnections.app/introducing-pro-plugins/" target="_external">Learn more</a> about Pro plugins.`;

function default_smart_plugins_list() {
  return [
    {
      item_type: 'core',
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
      item_desc: 'See notes related to what you are working on right now.',
      plugin_id: 'smart-lookup',
      url: 'https://smartconnections.app/smart-lookup/',
      install_type: 'github', // get direct from github (other core plugins use Obsidian community plugins list)
      item_repo: 'brianpetro/smart-lookup-obsidian', // used if install_type is github
    },
    {
      item_type: 'core',
      item_name: 'Smart Templates',
      item_desc: 'See notes related to what you are working on right now.',
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
};
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

  // const get_installed_info = async () => {
  //   const installed_map = {};
  //   let { manifests } = app.plugins;
  //   while (Object.keys(manifests).length === 0) {
  //     manifests = app.plugins.manifests;
  //     await new Promise((resolve) => setTimeout(resolve, 100));
  //   }
  //   for (const plugin_id in manifests) {
  //     if (!Object.prototype.hasOwnProperty.call(manifests, plugin_id)) continue; // skip inherited properties
  //     const { name, version } = manifests[plugin_id];
  //     installed_map[plugin_id] = { name, version };
  //   }
  //   return installed_map;
  // };
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

  const render_smart_plugins = async (sub_exp=null) => {
    render_login(sub_exp);

    // const installed_map = await get_installed_info();

    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
    render_referrals(token, sub_exp);

    try {
      await app.plugins.loadManifests(); // ensure we have the latest plugin manifests to compare versions for installed plugins
      const resp = await fetch_server_plugin_list(token);
      const {sub_exp} = resp || {};
      if (sub_exp) {
        render_login(sub_exp);
        render_referrals(token, sub_exp);
      }
      hydrate_plugins_list(resp, app);
      let current_group = null;
      for (const item of SMART_PLUGINS_LIST) {
        const row = await render_component('smart_plugins_list_item', item, {
          ...params,
          app,
          // installed_map,
        });
        if(!current_group || item.start_of_group) {
          const group_frag = this.create_doc_fragment(`<div class="setting-group"><div class="setting-items"></div></div>`);
          current_group = group_frag.firstElementChild;
          official_list_el.appendChild(current_group);
        }
        if (row) current_group.querySelector('.setting-items').appendChild(row);
      }

      // TODO: add community plugins
      community_list_el.appendChild(this.create_doc_fragment(`<div class="coming-soon"><p>Community plugins are coming soon!</p></div>`));
    } catch (err) {
      console.error('[smart-plugins:list] Failed to fetch plugin list:', err);
      this.empty(official_list_el);
      official_list_el.appendChild(this.create_doc_fragment(`<div class="error"><p>Failed to load plugin information.</p><button class="retry">Retry</button></div>`));
      SMART_PLUGINS_LIST = default_smart_plugins_list(); // reset to default list on error
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


// mutates SMART_PLUGINS_LIST based on server response
function hydrate_plugins_list(server_resp, app) {
  console.log('Server plugin list response:', server_resp);
  const { list = [], sub_exp } = server_resp || {};
  let sub_active = false;
  if (sub_exp && sub_exp > Date.now()) {
    sub_active = true;
  }
  console.log({ list, sub_exp });
  for (const server_item of list) {
    const local_items = SMART_PLUGINS_LIST.filter((i) => i.plugin_id === server_item.plugin_id);
    if(local_items.length === 0) {
      SMART_PLUGINS_LIST.push(server_item);
      continue;
    }
    for (const local_item of local_items) {
      console.log(JSON.stringify(local_item, null, 2));
      console.log(JSON.stringify(server_item, null, 2));
      Object.assign(local_item, server_item);
    }
  }

  const installed_plugins = Object.values(app.plugins.manifests || {});
  for (const installed_item of installed_plugins) {
    const matches = SMART_PLUGINS_LIST.filter((m) => m.plugin_id === installed_item.id);
    for (const match of matches) {
      match.manifest = installed_item;
      match.installed_type = installed_item.name.includes('Pro') ? 'pro' : 'core';
      match.installed_version = installed_item.version;
      match.should_update = compare_versions(match.version, installed_item.version) > 0;
    }
  }

  for (let i = 0; i < SMART_PLUGINS_LIST.length; i++) {
    const item = SMART_PLUGINS_LIST[i];
    item.is_installed = item.installed_type === item.item_type;// || (item.item_type === 'core' && item.installed_type === 'pro');
    item.is_enabled = app.plugins.enabledPlugins.has(item.plugin_id);
    item.can_enable = item.is_installed && !item.is_enabled && item.installed_type === item.item_type;


    const prev = SMART_PLUGINS_LIST[i - 1];
    const next = SMART_PLUGINS_LIST[i + 1];
    item.can_install = sub_active || item.item_type === 'core';
    if(prev?.plugin_id === item.plugin_id && next?.plugin_id !== item.plugin_id) {
      item.end_of_group = true;
    }
    if(prev?.plugin_id !== item.plugin_id && next?.plugin_id === item.plugin_id) {
      item.start_of_group = true;
    }
    if(prev?.plugin_id !== item.plugin_id && next?.plugin_id !== item.plugin_id) {
      item.start_of_group = true;
      item.end_of_group = true;
    }
  }
  console.log('Hydrated plugin list:', SMART_PLUGINS_LIST);
}