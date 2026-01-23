import { Setting, Notice, requestUrl } from 'obsidian';
import {
  get_oauth_storage_prefix,
  get_smart_server_url,
  fetch_server_plugin_list,
  fetch_referral_stats,
} from '../../utils/smart_plugins.js';
import styles from './style.css';

const PRO_PLUGINS_DESC = `<a href="https://smartconnections.app/core-plugins/" target="_external">Core plugins</a> provide essential functionality and a "just works" experience. <a href="https://smartconnections.app/pro-plugins/" target="_external">Pro plugins</a> enable advanced configuration and features for Obsidian AI experts.`;
const PRO_PLUGINS_FOOTER = `All Pro plugins include advanced configurations and additional model providers. Pro users get priority support via email. <a href="https://smartconnections.app/introducing-pro-plugins/" target="_external">Learn more</a> about Pro plugins.`;

function derive_fallback_plugins() {
  const pro_placeholders = [
    {
      name: 'Chat Pro',
      description: 'Configure chat to use Local and Cloud API providers (Ollama, LM Studio, OpenAI, Gemini, Anthropic, Open Router, and more).',
      core_id: 'smart-chatgpt',
      url: 'https://smartconnections.app/smart-chat/'
    },
    {
      name: 'Connections Pro',
      description: 'More opportunities for connections. Graph view for visualizing. Inline and footer views (great for mobile!). Configurable algorithms and additional embedding model providers.',
      core_id: 'smart-connections',
      url: 'https://smartconnections.app/smart-connections/'
    },
    {
      name: 'Context Pro',
      description: 'Advanced tools for context engineering. Utilize Bases, images, and external sources (great for coders!) in your contexts.',
      core_id: 'smart-context',
      url: 'https://smartconnections.app/smart-context/'
    },
  ];

  return pro_placeholders;
}

export function build_html(env, params = {}) {
  return `
    <div class="pro-plugins-container setting-item-heading">
      <div class="setting-group">
        <div class="setting-item setting-item-heading">
          <div class="setting-item-name pro-heading">Pro plugins</div>
          <div class="setting-item-control">
            <section class="smart-plugins-login"></section>
          </div>
        </div>
        <p>${PRO_PLUGINS_DESC}</p>
        <div class="setting-items pro-plugins-list">
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
  await post_process.call(this, env, container, params);
  return container;
}

export async function post_process(env, container, params = {}) {
  const plugin = env.plugin || null;
  const app = plugin?.app || window.app;

  const oauth_storage_prefix = get_oauth_storage_prefix(app);

  const login_container = container.querySelector('.smart-plugins-login');
  const referral_container = container.querySelector('.smart-plugins-referral');
  const pro_list_el = container.querySelector('.pro-plugins-list');

  const placeholders = derive_fallback_plugins();

  let login_click_count = 0;
  let last_login_url = '';
  let manual_login_el = null;

  const empty_container = (el) => {
    if (!el) return;
    if (typeof this.empty === 'function') {
      this.empty(el);
      return;
    }
    el.innerHTML = '';
  };

  const render_manual_login_link = (login_url) => {
    if (!login_container) return;
    if (!login_url) return;

    if (!manual_login_el || !manual_login_el.isConnected) {
      manual_login_el = document.createElement('div');
      manual_login_el.classList.add('smart-plugins-login-manual');
      login_container.appendChild(manual_login_el);
    }

    manual_login_el.innerHTML = '';

    const instructions = document.createElement('div');
    instructions.classList.add('smart-plugins-login-manual-instructions');
    instructions.textContent = 'If the login page did not open, copy this link and paste it into your browser to open the login page:';
    manual_login_el.appendChild(instructions);

    const controls = document.createElement('div');
    controls.classList.add('smart-plugins-login-manual-controls');
    manual_login_el.appendChild(controls);

    const input = document.createElement('input');
    input.classList.add('smart-plugins-login-manual-input');
    input.type = 'text';
    input.value = login_url;
    input.readOnly = true;
    input.addEventListener('focus', () => input.select());
    controls.appendChild(input);

    const btn = document.createElement('button');
    btn.classList.add('mod-cta');
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const ok = await copy_to_clipboard(login_url);
      if (ok) {
        new Notice('Copied login link to clipboard.');
      } else {
        new Notice('Copy failed. Please select and copy the link manually.');
      }
    });
    controls.appendChild(btn);
  };

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

  const initiate_oauth_login = async () => {
    login_click_count++;
    if (login_click_count >= 2 && last_login_url) {
      render_manual_login_link(last_login_url);
    }

    if (env && typeof env.initiate_smart_plugins_oauth === 'function') {
      last_login_url = initiate_smart_plugins_oauth();
    }

    new Notice('Please complete the login in your browser.');

  };

  const render_oauth_login_section = () => {
    this.empty(login_container);
    manual_login_el = null;

    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';

    if (!token) {
      const setting = new Setting(login_container)
        .setName('Connect account')
        .setDesc('Log in with the key provided in your Pro welcome email.');

      setting.addButton((btn) => {
        btn.setButtonText('Login');
        btn.onClick(async () => {
          await initiate_oauth_login();
        });
      });

      return;
    }

    const setting = new Setting(login_container);
    setting.setDesc('Signed in to Smart Plugins Pro account.');
    setting.addButton((btn) => {
      btn.setButtonText('Logout');
      btn.onClick(() => {
        localStorage.removeItem(oauth_storage_prefix + 'token');
        localStorage.removeItem(oauth_storage_prefix + 'refresh');
        new Notice('Logged out of Smart Plugins');
        render_oauth_login_section();
        render_referral_section();
        render_plugin_list_section();
      });
    });
  };

  /**
   * @param {object} params
   * @param {string} params.token
   * @param {number|null} params.sub_exp
   */
  const render_referral_section = async (params = {}) => {
    empty_container(referral_container);

    const token = String(params.token || '').trim();
    if (!token) {
      const setting = new Setting(referral_container)
        .setName('Give $30 off Pro. Get 30 days of Pro')
        .setDesc('Start a free trial to unlock your referral link.');

      setting.addButton((btn) => {
        btn.setButtonText('Start free trial');
        btn.onClick(() => {
          window.open('https://smartconnections.app/pro-plugins/', '_external');
        });
      });

      return;
    }

    const sub_exp = Number(params.sub_exp ?? 0) || 0;
    if (sub_exp && sub_exp < Date.now()) return;

    try {
      const stats = await fetch_referral_stats({ token });
      const referral_link = String(stats?.referral_link || '').trim();
      if (!referral_link) return;

      const setting = new Setting(referral_container)
        .setName('Referral link')
        .setDesc('Give $30 off Pro. Get 30 days of Pro.');

      setting.addButton((btn) => {
        btn.setButtonText('Copy link');
        btn.onClick(async () => {
          const ok = await copy_to_clipboard(referral_link);
          new Notice(ok ? 'Referral link copied.' : 'Copy failed. Please try again.');
        });
      });

      setting.addButton((btn) => {
        btn.setButtonText('Open referrals');
        btn.onClick(() => {
          window.open('https://smartconnections.app/my-referrals/', '_external');
        });
      });
    } catch (err) {
      console.error('[pro-plugins:list] Failed to load referral stats:', err);
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

  const add_update_sub_to_login_section = () => {
    const setting = new Setting(login_container)
      .setName('Subscription Expired')
      .setDesc('Your Smart Connections Pro subscription has expired. Please update your subscription to retain access to Pro plugins.')
    ;
    setting.addButton((btn) => {
      btn.setButtonText('Get Pro');
      btn.onClick(() => {
        window.open('https://smartconnections.app/subscribe/', '_external');
      });
    });
    setting.addButton((btn) => {
      btn.setButtonText('Update subscription');
      btn.onClick(() => {
        window.open('https://smartconnections.app/subscription-update/', '_external');
      });
    });
    setting.addButton((btn) => {
      btn.setButtonText('Refresh');
      btn.onClick(() => {
        env.events.emit('pro_plugins:refresh');
      });
    });
  };

  const render_plugin_list_section = async () => {
    this.empty(pro_list_el);
    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
    if (!token) {
      await render_fallback_plugin_list();
      await render_referral_section();
      return;
    }

    try {
      const installed_map = await get_installed_info();
      const resp = await fetch_server_plugin_list(token);
      const { list = [], unauthorized = [], sub_exp } = resp;

      if (typeof sub_exp === 'number' && sub_exp < Date.now()) {
        add_update_sub_to_login_section();
        await render_fallback_plugin_list();
        await render_referral_section();
        return;
      }

      await render_referral_section({ token, sub_exp });

      if (!Array.isArray(list) || list.length === 0) {
        await render_fallback_plugin_list();
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

function initiate_smart_plugins_oauth() {
  console.log("initiate_smart_plugins_oauth");
  const state = Math.random().toString(36).slice(2);
  const redirect_uri = encodeURIComponent("obsidian://smart-plugins/callback");
  const url = `${get_smart_server_url()}/oauth?client_id=smart-plugins-op&redirect_uri=${redirect_uri}&state=${state}`;
  window.open(url, '_external');
  return url;
}

const copy_to_clipboard = async (text) => {
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {}

  return false;
};
