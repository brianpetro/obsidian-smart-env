import { requestUrl } from 'obsidian';
import {
  parse_zip_into_files,
  write_files_with_adapter,
  fetch_plugin_zip,
  enable_plugin,
  fetch_zip_from_url,
} from '../../utils/smart_plugins.js';

const PRO_PLUGINS_URL = 'https://smartconnections.app/pro-plugins/';
const OBSIDIAN_PLUGIN_URL = 'https://obsidian.md/plugins?id=';

/**
 * @param {import('./list').PluginListItem} item
 */
export function build_html(item, params = {}) {
  const row_control_state = resolve_row_control_state(item, params);
  return `<div class="setting-item pro-plugins-list-item" data-item-type="${item.item_type}" data-item-state="${item.state || ''}" data-row-control-state="${row_control_state}">
    <div class="setting-item-info">
      <div class="setting-item-name ${item.item_type === 'core' ? 'smart-badge core-badge' : 'smart-badge pro-badge'}">${item.formatted_name}</div>
      <div class="setting-item-description">${item.formatted_description}</div>
    </div>
    <div class="setting-item-control"></div>
  </div>`;
}
/**
 * @param {import('./list').PluginListItem} item
 */
export async function render(item, params = {}) {
  const html = build_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, item, container, params);
  return container;
}

/**
 * @param {import('./list').PluginListItem} item
 */
export async function post_process(item, container, params = {}) {
  const control_container = container.querySelector('.setting-item-control');
  if (!control_container) return container;

  const controls = await render_controls.call(this, item, params);
  this.empty(control_container);
  if (controls) control_container.appendChild(controls);

  return container;
}

function build_controls_html(item, params = {}) {
  const control_specs = get_control_specs(item, params);
  return `<div class="smart-plugins-list-item-controls">${control_specs.map(build_control_html).join('')}</div>`;
}

async function render_controls(item, params = {}) {
  const html = build_controls_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process_controls.call(this, item, container, params);
  return container;
}

async function post_process_controls(item, container, params = {}) {
  const app = params.app || window.app;
  const env = params.env || this.env || null;
  const token = params.token || '';

  const buttons = container.querySelectorAll('button[data-action]');
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const action = button.getAttribute('data-action');
      if (!action) return;

      switch (action) {
        case 'install':
          await run_busy_action(button, async () => {
            await handle_install_action(item, { app, env, token });
          }, item.should_update ? 'Updating…' : 'Installing…');
          break;
        case 'enable':
          await run_busy_action(button, async () => {
            await enable_plugin(app, item.plugin_id);
            env?.events?.emit?.('pro_plugins:enabled', {
              level: 'info',
              message: `${item.label} enabled.`,
              event_source: 'browse_smart_plugins.list_item',
            });
            env?.events?.emit?.('pro_plugins:refresh', {
              event_source: 'browse_smart_plugins.list_item.enable',
            });
          }, 'Enabling…');
          break;
        case 'open_settings':
          app.setting.open();
          app.setting.openTabById(item.plugin_id);
          break;
        case 'learn_more':
          open_plugin_url(item);
          break;
        default:
          break;
      }
    });
  }

  return container;
}

function get_control_specs(item, params = {}) {
  const row_control_state = resolve_row_control_state(item, params);

  switch (row_control_state) {
    case 'update_available':
      return [
        create_button_spec('Update', 'install', 'primary'),
      ];
    case 'installed':
      return [
        create_button_spec('Open settings', 'open_settings'),
      ];
    case 'can_enable':
      return [
        create_button_spec('Enable', 'enable', 'primary'),
      ];
    case 'pro_installed':
      return [
        create_status_spec('Pro installed'),
      ];
    case 'included_in_pro':
      return [
        create_status_spec('Included in Pro'),
      ];
    case 'core_installed':
      return [
        create_status_spec('Core installed'),
        ...(item.can_install ? [create_button_spec('Install Pro', 'install', 'primary')] : []),
        create_button_spec('Learn more', 'learn_more'),
      ];
    case 'can_install_core_only':
      return [
        create_button_spec('Install Core', 'install', 'primary'),
      ];
    case 'can_install_pro':
      return [
        create_button_spec('Install Pro', 'install', 'primary'),
        create_button_spec('Learn more', 'learn_more'),
      ];
    case 'cant_install':
      return [
        create_button_spec('Learn more', 'learn_more', 'primary'),
      ];
    case 'can_install':
    default:
      return [
        create_button_spec('Install', 'install', 'primary'),
        create_button_spec('Learn more', 'learn_more'),
      ];
  }
}

function resolve_row_control_state(item, params = {}) {
  const grouped_row_control_state = resolve_grouped_row_control_state(item, params);
  if (grouped_row_control_state) return grouped_row_control_state;
  if (item.item_type === 'pro' && item.state === 'can_install') return 'can_install_pro';
  return item.state || 'can_install';
}

function resolve_grouped_row_control_state(item, params = {}) {
  const group_items = Array.isArray(params.group_items) ? params.group_items : [];
  if (group_items.length < 2) return '';

  const group_state = params.group_state || item.group_state || '';
  if (group_state === 'pro_can_install') {
    if (item.item_type === 'core' && item.state === 'can_install') {
      return 'included_in_pro';
    }
    if (item.item_type === 'pro' && item.state === 'can_install') {
      return 'can_install_pro';
    }
  }

  if (group_state === 'core_can_install') {
    if (item.item_type === 'core' && item.state === 'can_install') {
      return 'can_install_core_only';
    }
  }

  return '';
}

function build_control_html(control_spec) {
  if (control_spec.type === 'status') {
    return `<span class="core-installed-text">${control_spec.text}</span>`;
  }

  const class_name = control_spec.variant === 'primary' ? 'mod-cta' : '';
  return `<button class="${class_name}" data-action="${control_spec.action}">${control_spec.text}</button>`;
}

function create_button_spec(text, action, variant = 'secondary') {
  return {
    type: 'button',
    action,
    text,
    variant,
  };
}

function create_status_spec(text) {
  return {
    type: 'status',
    text,
  };
}

async function run_busy_action(button, callback, busy_text) {
  if (!button || typeof callback !== 'function') return;

  const idle_text = button.textContent;
  button.disabled = true;
  if (busy_text) button.textContent = busy_text;

  try {
    await callback();
  } finally {
    button.disabled = false;
    button.textContent = idle_text;
  }
}

async function handle_install_action(item, params = {}) {
  if (item.item_type === 'core') {
    if (item.install_type === 'github') {
      await install_github_release_plugin(item, params);
      return;
    }

    open_core_install(item);
    return;
  }

  await install_plugin(item, {
    ...params,
    on_installed: async () => {
      params.env?.events?.emit?.('pro_plugins:refresh', {
        event_source: 'browse_smart_plugins.list_item.install',
      });
    },
  });
}

function open_core_install(item) {
  window.open(`${OBSIDIAN_PLUGIN_URL}${encodeURIComponent(item.plugin_id)}`, '_external');
}

function open_plugin_url(item) {
  const url = with_utm_source(item.url || PRO_PLUGINS_URL, 'plugin-store');
  window.open(url, '_external');
}

function with_utm_source(url, source) {
  if (!url) return PRO_PLUGINS_URL;
  return url.includes('?')
    ? `${url}&utm_source=${source}`
    : `${url}?utm_source=${source}`
  ;
}

const download_plugin_zip = async (item, token) => {
  const resolved_download_url = typeof item.resolve_download_url === 'function'
    ? await item.resolve_download_url()
    : item.download_url
  ;

  if (resolved_download_url) {
    return fetch_zip_from_url(resolved_download_url);
  }

  if (!token) {
    throw new Error('Login required to install this plugin.');
  }

  return fetch_plugin_zip(item.repo, token);
};

const install_plugin = async (item, params = {}) => {
  const { app, token, on_installed, env = null } = params;
  try {
    env?.events?.emit?.('pro_plugins:install_started', {
      level: 'info',
      message: `Installing "${item.label}" ...`,
      event_source: 'browse_smart_plugins.list_item',
    });

    const zip_data = await download_plugin_zip(item, token);
    const { files, pluginManifest } = await parse_zip_into_files(zip_data);

    const folder_name = item.plugin_id || pluginManifest?.id;
    const base_folder = `${app.vault.configDir}/plugins/${folder_name}`;
    await write_files_with_adapter(app.vault.adapter, base_folder, files);

    await app.plugins.loadManifests();

    if (app.plugins.enabledPlugins.has(item.plugin_id)) {
      await app.plugins.disablePlugin(item.plugin_id);
    }
    await enable_plugin(app, item.plugin_id);

    env?.events?.emit?.('pro_plugins:install_completed', {
      level: 'attention',
      message: `${item.label} installed successfully.`,
      event_source: 'browse_smart_plugins.list_item',
    });
    if (typeof on_installed === 'function') {
      await on_installed();
    }
  } catch (err) {
    console.error('[pro-plugins:list_item] Install error:', err);
    env?.events?.emit?.('pro_plugins:install_failed', {
      level: 'error',
      message: `Install failed: ${err.message}`,
      details: err?.stack || '',
      event_source: 'browse_smart_plugins.list_item',
    });
  }
};

async function install_github_release_plugin(item, params = {}) {
  const { app, env = null, on_installed } = params;

  if (!item.repo) {
    throw new Error(`Missing GitHub repo for "${item.label}".`);
  }
  if (!item.plugin_id) {
    throw new Error(`Missing plugin id for "${item.label}".`);
  }

  try {
    env?.events?.emit?.('pro_plugins:install_started', {
      level: 'info',
      message: `Installing "${item.label}" ...`,
      event_source: 'browse_smart_plugins.list_item',
    });

    const { json: release } = await requestUrl({
      url: `https://api.github.com/repos/${item.repo}/releases/latest`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      contentType: 'application/json',
    });

    const assets = release?.assets || [];
    const main_asset = assets.find((asset) => asset.name === 'main.js');
    const manifest_asset = assets.find((asset) => asset.name === 'manifest.json');
    const styles_asset = assets.find((asset) => asset.name === 'styles.css');

    if (!main_asset || !manifest_asset || !styles_asset) {
      throw new Error('Failed to find necessary assets in the latest GitHub release.');
    }

    const plugin_folder = `${app.vault.configDir}/plugins/${item.plugin_id}`;
    if (!await app.vault.adapter.exists(plugin_folder)) {
      await app.vault.adapter.mkdir(plugin_folder);
    }

    await Promise.all([
      download_and_write_release_asset(app, main_asset.browser_download_url, `${plugin_folder}/main.js`),
      download_and_write_release_asset(app, manifest_asset.browser_download_url, `${plugin_folder}/manifest.json`),
      download_and_write_release_asset(app, styles_asset.browser_download_url, `${plugin_folder}/styles.css`),
    ]);

    await app.plugins.loadManifests();
    if (app.plugins.enabledPlugins.has(item.plugin_id)) {
      await app.plugins.disablePlugin(item.plugin_id);
    }
    await enable_plugin(app, item.plugin_id);

    env?.events?.emit?.('pro_plugins:install_completed', {
      level: 'attention',
      message: `${item.label} installed successfully.`,
      event_source: 'browse_smart_plugins.list_item',
    });
    env?.events?.emit?.('pro_plugins:refresh', {
      event_source: 'browse_smart_plugins.list_item.install_github_release_plugin',
    });
    if (typeof on_installed === 'function') {
      await on_installed();
    }
  } catch (err) {
    console.error('[smart-plugins:list_item] GitHub install error:', err);
    env?.events?.emit?.('pro_plugins:install_failed', {
      level: 'error',
      message: `Install failed: ${err.message}`,
      details: err?.stack || '',
      event_source: 'browse_smart_plugins.list_item.install_github_release_plugin',
    });
  }
}

async function download_and_write_release_asset(app, download_url, output_path) {
  const resp = await requestUrl({
    url: download_url,
    method: 'GET',
  });
  await app.vault.adapter.write(output_path, resp.text);
}
