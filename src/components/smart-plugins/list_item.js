import { Setting, Modal, MarkdownRenderer, Component } from 'obsidian';
import {
  parse_zip_into_files,
  write_files_with_adapter,
  is_server_version_newer,
  fetch_plugin_zip,
  fetch_plugin_readme,
  enable_plugin,
  fetch_zip_from_url,
} from '../../utils/smart_plugins.js';

const PRO_PLUGINS_URL = 'https://smartconnections.app/pro-plugins/';
const OBSIDIAN_PLUGIN_URL = 'https://obsidian.md/plugins?id=';

export function build_html(item, params = {}) {
  // return `<div class="pro-plugins-list-item"></div>`;
  return `<div class="setting-item pro-plugins-list-item${item.item_type === 'pro' ? ' pro-setting' : ''}">
    <div class="setting-item-info">
      <div class="setting-item-name">${item.item_name?.replace('Smart ', '').replace('Pro', '').trim() || item.name}</div>
      <div class="setting-item-description">${item.item_desc || item.description || ''}</div>
    </div>
    <div class="setting-item-control"></div>
</div>`;
}

export async function render(item, params = {}) {
  const html = build_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, item, container, params);
  return container;
}
async function post_process(item, container, params = {}) {
  const app = params.app || window.app;
  const env = this.env;
  const control_container = container.querySelector('.setting-item-control');
  const create_primary_btn = (btn_text, click_callback) => {
    const btn = this.create_doc_fragment(`<button class="mod-cta">${btn_text}</button>`).firstElementChild;
    btn.addEventListener('click', click_callback);
    return btn;
  }
  const create_secondary_btn = (btn_text, click_callback) => {
    const btn = this.create_doc_fragment(`<button class="">${btn_text}</button>`).firstElementChild;
    btn.addEventListener('click', click_callback);
    return btn;
  }
  
  if (item.is_installed) {
    if(item.should_update) {
      const update_btn = create_primary_btn('Update', () => install_plugin(item, { ...params, env }));
      control_container.appendChild(update_btn);
    } else if (item.is_enabled) {
      if(item.installed_type === item.item_type) {
        const open_btn = create_secondary_btn('Open settings', () => {
          app.setting.open();
          // setTimeout(() => { app.setting.openTabById(item.plugin_id) }, 30);
          app.setting.openTabById(item.plugin_id);
        });
        control_container.appendChild(open_btn);
      } else {
        const pro_installed_span = document.createElement('span');
        pro_installed_span.textContent = `Pro version installed`;
        control_container.appendChild(pro_installed_span);
      }
    } else if (item.can_enable) {
      const enable_btn = create_primary_btn('Enable', async () => {
        await enable_plugin(app, item.plugin_id);
        env?.events?.emit?.('pro_plugins:enabled', {
          level: 'info',
          message: `${item.repo} enabled.`,
          event_source: 'browse_smart_plugins.list_item',
        });
        enable_btn.remove();
        const restart_btn = create_primary_btn('Restart Obsidian', () => {
          window.location.reload();
        });
        control_container.appendChild(restart_btn);
      });
      control_container.appendChild(enable_btn);
    }
  } else {
    if (item.can_install) {
      const install_btn = create_primary_btn('Install', () => install_plugin(item, { ...params, env }));
      control_container.appendChild(install_btn);
      const readme_btn = create_secondary_btn('Learn more', () => console.log('TODO'));
      control_container.appendChild(readme_btn);
    } else {
      const cta_btn = create_primary_btn('Learn more', () => {
        window.open(item.url + '?utm_source=plugin-store', '_external');
      });
      control_container.appendChild(cta_btn);
    }
  }


  return container;
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
      message: `Installing "${item.repo}" ...`,
      event_source: 'browse_smart_plugins.list_item',
    });

    const zip_data = await download_plugin_zip(item, token);
    const { files, pluginManifest } = await parse_zip_into_files(zip_data);

    const folder_name = item.plugin_id || item.manifest_id || pluginManifest?.id;
    const base_folder = `${app.vault.configDir}/plugins/${folder_name}`;
    await write_files_with_adapter(app.vault.adapter, base_folder, files);

    await app.plugins.loadManifests();

    const plugin_id = pluginManifest?.id || item.manifest_id || folder_name;
    if (app.plugins.enabledPlugins.has(plugin_id)) {
      await app.plugins.disablePlugin(plugin_id);
    }
    await enable_plugin(app, plugin_id);

    env?.events?.emit?.('pro_plugins:install_completed', {
      level: 'attention',
      message: `${item.repo} installed successfully.`,
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

const show_plugin_readme = async (item, params = {}) => {
  const { app, token, display_name, env = null } = params;
  try {
    const readme = await fetch_plugin_readme(item.repo, token);
    const modal = new Modal(app);
    modal.setTitle(display_name || item.name || item.repo);
    await MarkdownRenderer.render(app, readme, modal.contentEl, '', new Component());
    modal.open();
  } catch (err) {
    console.error('[pro-plugins:list_item] Failed to load README:', err);
    env?.events?.emit?.('pro_plugins:readme_load_failed', {
      level: 'error',
      message: 'Failed to load README',
      details: err?.message || '',
      event_source: 'browse_smart_plugins.show_readme',
    });
  }
};
