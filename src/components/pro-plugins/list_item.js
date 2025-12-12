import { Setting, Notice, Modal, MarkdownRenderer, Component } from 'obsidian';
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

export function build_html(item, params = {}) {
  return `<div class="pro-plugins-list-item"></div>`;
}

/**
 * Determines whether an item represents a local fallback definition
 * (no repo/version data from the server).
 * @param {object} item
 * @returns {boolean}
 */
function is_fallback_item(item) {
  return !item || !item.repo;
}

export function compute_display_state(item, local_info) {
  const repo_name = item.repo;
  const server_version = item.version || 'unknown';
  const plugin_id = item.manifest_id || repo_name.replace('/', '_');
  const local_version = local_info?.version || null;
  const display_name = local_info?.name || item.name || repo_name;

  let desc = `Server version: ${server_version}`;
  let button_label = 'Install';
  let is_disabled = false;

  if (local_version) {
    desc += ` | Installed version: ${local_version}`;
    const is_update = is_server_version_newer(local_version, server_version);
    if (is_update) {
      button_label = 'Update';
    } else {
      button_label = 'Installed';
      is_disabled = true;
    }
  }

  if (item.description) {
    desc += `\n${item.description}`;
  }

  return { plugin_id, display_name, desc, button_label, is_disabled, server_version, local_version };
}

export async function render(item, params = {}) {
  const html = build_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, item, container, params);
  return container;
}

async function post_process(item, container, params = {}) {
  const { app, token, installed_map = {}, on_installed } = params;

  if (is_fallback_item(item)) {
    const row = new Setting(container)
      .setName(item.name || 'Pro plugin')
      .setDesc(item.description || 'Login to unlock Pro plugins.')
    ;

    if (item.core_id) {
      if(app.plugins.manifests[item.core_id]) {
        const core_installed_text = document.createElement('i');
        core_installed_text.classList.add('core-installed-text');
        core_installed_text.textContent = 'Core installed!';
        row.controlEl.appendChild(core_installed_text);
      } else {
        const get_core_link = document.createElement('a');
        get_core_link.setAttribute('href', `obsidian://show-plugin?id=${item.core_id}`);
        get_core_link.setAttribute('target', '_external');
        get_core_link.textContent = 'Install Core';
        get_core_link.style.marginLeft = '10px';
        get_core_link.classList.add('get-core-link');
        row.controlEl.appendChild(get_core_link);
      }
    }
    row.addButton((btn) => {
      btn.setButtonText('Get Pro');
      btn.onClick(() => {
        window.open(PRO_PLUGINS_URL, '_external');
      });
    });
    row.addButton((btn) => {
      btn.setButtonText('Learn more');
      btn.onClick(() => {
        window.open(item.url, '_external');
      });
    });

    return container;
  }

  const plugin_id = item.manifest_id || item.repo.replace('/', '_');
  const local = installed_map[plugin_id] || null;
  const state = compute_display_state(item, local);

  const row = new Setting(container)
    .setName(state.display_name)
    .setDesc(state.desc);

  row.addButton((btn) => {
    btn.setButtonText(state.button_label);
    btn.setDisabled(state.is_disabled);
    btn.onClick(() => install_plugin(item, { app, token, on_installed }));
  });

  row.addButton((btn) => {
    btn.setButtonText('Docs');
    if (item.docs_url) {
      btn.onClick(() => window.open(item.docs_url, '_external'));
    } else {
      btn.onClick(() => show_plugin_readme(item, { app, token, display_name: state.display_name }));
    }
  });

  return container;
}

const download_plugin_zip = async (item, token) => {
  const resolved_download_url = typeof item.resolve_download_url === 'function'
    ? await item.resolve_download_url()
    : item.download_url;

  if (resolved_download_url) {
    return fetch_zip_from_url(resolved_download_url);
  }

  if (!token) {
    throw new Error('Login required to install this plugin.');
  }

  return fetch_plugin_zip(item.repo, token);
};

const install_plugin = async (item, params = {}) => {
  const { app, token, on_installed } = params;
  try {
    new Notice(`Installing "${item.repo}" ...`);

    const zip_data = await download_plugin_zip(item, token);
    const { files, pluginManifest } = await parse_zip_into_files(zip_data);

    const folder_name = item.plugin_id;
    const base_folder = `${app.vault.configDir}/plugins/${folder_name}`;
    await write_files_with_adapter(app.vault.adapter, base_folder, files);

    await app.plugins.loadManifests();

    const plugin_id = pluginManifest?.id || item.manifest_id || folder_name;
    if (app.plugins.enabledPlugins.has(plugin_id)) {
      await app.plugins.disablePlugin(plugin_id);
    }
    await enable_plugin(app, plugin_id);

    new Notice(`${item.repo} installed successfully.`);
    if (typeof on_installed === 'function') {
      await on_installed();
    }
  } catch (err) {
    console.error('[pro-plugins:list_item] Install error:', err);
    new Notice(`Install failed: ${err.message}`);
  }
};

const show_plugin_readme = async (item, params = {}) => {
  const { app, token, display_name } = params;
  try {
    const readme = await fetch_plugin_readme(item.repo, token);
    const modal = new Modal(app);
    modal.setTitle(display_name || item.name || item.repo);
    await MarkdownRenderer.render(app, readme, modal.contentEl, '', new Component());
    modal.open();
  } catch (err) {
    console.error('[pro-plugins:list_item] Failed to load README:', err);
    new Notice('Failed to load README');
  }
};
