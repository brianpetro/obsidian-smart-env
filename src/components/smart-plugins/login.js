import { Setting } from 'obsidian';
import { copy_to_clipboard } from '../../utils/copy_to_clipboard.js';
import {
  get_oauth_storage_prefix,
  get_smart_server_url,
} from '../../utils/smart_plugins.js';
import { convert_to_time_ago } from 'smart-utils/convert_to_time_ago.js';
import { convert_to_time_until } from 'smart-utils/convert_to_time_until.js';

export function build_html(env, params = {}) {
  return `<div class="smart-plugins-login-component"></div>`;
}

export async function render(env, params = {}) {
  const html = build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, env, container, params);
  return container;
}

export async function post_process(env, container, params = {}) {
  const app = env?.plugin?.app || window.app;
  const oauth_storage_prefix = get_oauth_storage_prefix(app);
  const sub_exp = Number(params.sub_exp ?? 0) || 0;
  let login_click_count = 0;
  let last_login_url = '';
  let manual_login_el = null;

  const render_manual_login_link = (login_url) => {
    if (!login_url) return;

    if (!manual_login_el || !manual_login_el.isConnected) {
      manual_login_el = document.createElement('div');
      manual_login_el.classList.add('smart-plugins-login-manual');
      container.appendChild(manual_login_el);
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
      await copy_to_clipboard(login_url, {
        env,
        event_source: 'smart_plugins_login.manual_link_copy',
        success_event_key: 'pro_plugins:login_link_copied',
        error_event_key: 'pro_plugins:login_link_copy_failed',
        unavailable_event_key: 'pro_plugins:login_link_copy_unavailable',
      });
    });
    controls.appendChild(btn);
  };

  const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
  if (!token) {
    const setting = new Setting(container)
      .setName('Connect account')
      .setDesc('Log in with the key provided in your Pro welcome email.')
    ;

    setting.addButton((btn) => {
      btn.setButtonText('Login');
      btn.onClick(() => {
        login_click_count += 1;
        last_login_url = initiate_smart_plugins_oauth();
        if (login_click_count >= 2) {
          render_manual_login_link(last_login_url);
        }
        env?.events?.emit?.('pro_plugins:oauth_browser_login_requested', {
          level: 'info',
          message: 'Please complete the login in your browser.',
          event_source: 'smart_plugins_login',
        });
      });
    });

    return container;
  }

  if (sub_exp && sub_exp < Date.now()) {
    const setting = new Setting(container)
      .setName('Subscription expired')
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
        env?.events?.emit?.('pro_plugins:refresh', {
          event_source: 'smart_plugins_login',
        });
      });
    });

    return container;
  }

  const setting = new Setting(container);
  setting.setDesc(`Signed in to Smart Plugins Pro account. ${subscription_status(sub_exp)}`);
  setting.addButton((btn) => {
    btn.setButtonText('Logout');
    btn.onClick(() => {
      localStorage.removeItem(oauth_storage_prefix + 'token');
      localStorage.removeItem(oauth_storage_prefix + 'refresh');
      env?.events?.emit?.('pro_plugins:logged_out', {
        level: 'info',
        message: 'Logged out of Smart Plugins',
        event_source: 'smart_plugins_login',
      });
    });
  });

  return container;
}

function initiate_smart_plugins_oauth() {
  const state = Math.random().toString(36).slice(2);
  const redirect_uri = encodeURIComponent('obsidian://smart-plugins/callback');
  const url = `${get_smart_server_url()}/oauth?client_id=smart-plugins-op&redirect_uri=${redirect_uri}&state=${state}`;
  window.open(url, '_external');
  return url;
}

function subscription_status(sub_exp) {
  if (typeof sub_exp !== 'number') return '';
  if (sub_exp < Date.now()) {
    return `Subscription expired ${convert_to_time_ago(sub_exp)}.`;
  } else {
    return `Subscription active, renews ${convert_to_time_until(sub_exp)}.`;
  }
}