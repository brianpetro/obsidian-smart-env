import { Setting, Notice, requestUrl } from 'obsidian';
import {
  get_oauth_storage_prefix,
  get_smart_server_url,
} from '../../utils/smart_plugins.js';
import styles from './style.css';

const PRO_PLUGINS_DESC = `<a href="https://smartconnections.app/core-plugins/" target="_external">Core plugins</a> provide essential functionality and a "just works" experience. <a href="https://smartconnections.app/pro-plugins/" target="_external">Pro plugins</a> enable advanced configuration and features for Obsidian AI experts.`;
const PRO_PLUGINS_FOOTER = `All Pro plugins include advanced configurations and additional model providers. Pro users get priority support via email. <a href="https://smartconnections.app/introducing-pro-plugins/" target="_external">Learn more</a> about Pro plugins.`;
function derive_fallback_plugins() {
  const pro_placeholders = [
    {
      name: 'Chat Pro',
      description: 'Configure chat to use Local and Cloud API providers (Ollama, LM Studio, OpenAI, Gemini, Anthropic, Open Router, and more).',
      core_id: 'smart-chatgpt'
    },
    {
      name: 'Connections Pro',
      description: 'More opportunities for connections. Graph view for visualizing. Inline and footer views (great for mobile!). Configurable algorithms and additional embedding model providers.',
      core_id: 'smart-connections'
    },
    {
      name: 'Context Pro',
      description: 'Advanced tools for context engineering. Utilize Bases, images, and external sources (great for coders!) in your contexts.',
      core_id: 'smart-context'
    },
  ];

  return pro_placeholders;
}

export function build_html(env, params = {}) {
  return `
    <div class="pro-plugins-container">
      <h1>Pro plugins</h1>
      <p>${PRO_PLUGINS_DESC}</p>
      <section class="smart-plugins-list">
        <div class="pro-plugins-list"></div>
      </section>
      <footer class="smart-plugins-footer">${PRO_PLUGINS_FOOTER}</footer>
      <h2>Account</h2>
      <section class="smart-plugins-login">
      </section>
    </div>
  `;
}

export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const html = build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, env, container, params);
  return container;
}

export async function post_process(env, container, params = {}) {
  const plugin = env.plugin || null;
  const app = plugin?.app || window.app;

  const oauth_storage_prefix = get_oauth_storage_prefix(app);

  const login_container = container.querySelector('.smart-plugins-login');
  const pro_list_el = container.querySelector('.pro-plugins-list');

  const placeholders = derive_fallback_plugins();

  const get_installed_info = async () => {
    const installed_map = {};
    let { manifests } = app.plugins;
    while (Object.keys(manifests).length === 0) {
      manifests = app.plugins.manifests;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (const plugin_id in manifests) {
      if (!Object.prototype.hasOwnProperty.call(manifests, plugin_id)) continue;
      const { name, version } = manifests[plugin_id];
      installed_map[plugin_id] = { name, version };
    }
    return installed_map;
  };

  const initiate_oauth_login = () => {
    if (env && typeof env.initiate_smart_plugins_oauth === 'function') {
      env.initiate_smart_plugins_oauth();
      new Notice('Please complete the login in your browser.');
    }
  };

  const render_oauth_login_section = () => {
    this.empty(login_container);
    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';

    if (!token) {
      const setting = new Setting(login_container)
        .setName('Connect Account')
        .setDesc('Log in with your Smart Connections supporter key.');

      setting.addButton((btn) => {
        btn.setButtonText('Login');
        btn.onClick(() => initiate_oauth_login());
      });
    } else {
      const setting = new Setting(login_container)
        .setName('OAuth Token')
        .setDesc(token.slice(0, 16) + '...');

      setting.addButton((btn) => {
        btn.setButtonText('Logout');
        btn.onClick(() => {
          localStorage.removeItem(oauth_storage_prefix + 'token');
          localStorage.removeItem(oauth_storage_prefix + 'refresh');
          new Notice('Logged out of Smart Plugins');
          render_oauth_login_section();
          render_plugin_list_section();
        });
      });
    }
  };

  const render_fallback_plugin_list = async () => {
    this.empty(pro_list_el);

    if (!pro_list_el || placeholders.length === 0) return;

    for (const item of placeholders) {
      const row = await env.smart_components.render_component("pro_plugins_list_item", item, {
        env,
        app,
        installed_map: {},
      });
      pro_list_el.appendChild(row);
    }
  };

  const fetch_plugin_list = async (token) => {
    const resp = await requestUrl({
      url: `${get_smart_server_url()}/plugin_list`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    if (resp.status !== 200) {
      throw new Error(`Failed to fetch plugin list: ${resp.status} ${resp.text}`);
    }

    const { list = [] } = resp.json || {};
    return list;
  };

  const render_plugin_list_section = async () => {
    this.empty(pro_list_el);
    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
    if (!token) {
      await render_fallback_plugin_list();
      return;
    }

    try {
      const installed_map = await get_installed_info();
      const list = await fetch_plugin_list(token);

      if (!Array.isArray(list) || list.length === 0) {
        pro_list_el.textContent = 'No plugins found.';
        return;
      }

      for (const item of list) {
        const row = await env.smart_components.render_component("pro_plugins_list_item", item, {
          env,
          app,
          token,
          installed_map,
          on_installed: render_plugin_list_section,
        });
        pro_list_el.appendChild(row);
      }
    } catch (err) {
      console.error('[pro-plugins:list] Failed to fetch plugin list:', err);
      pro_list_el.textContent = 'Error fetching plugin list. Check console.';
    }
  };

  const render_smart_plugins = async () => {
    render_oauth_login_section();
    await render_plugin_list_section();
  };

  env.events.on('smart_plugins_oauth_completed', () => {
    render_smart_plugins();
  });

  await render_smart_plugins();
  return container;
}
