import { Setting, Notice, requestUrl, Modal, MarkdownRenderer, Component } from 'obsidian';
import {
  get_smart_server_url,
  parse_zip_into_files,
  write_files_with_adapter,
  is_server_version_newer,
  fetch_plugin_zip,
  fetch_plugin_readme,
  enable_plugin,
  fetch_zip_from_url,
  derive_fallback_plugins,
  get_oauth_storage_prefix,
} from '../utils/smart_plugins.js';



/**
 * Build the static shell HTML for Smart Plugins settings.
 *
 * @param {any} env
 * @param {object} [params]
 * @returns {string}
 */
export function build_html(env, params = {}) {
  return `
    <div class="sc-smart-plugins-settings">
      <h1>Pro plugins</h1>
      <p>Smart Plugins provide core functionality with minimal friction. Pro plugins enable advanced features. Pro plugin subscribers support continued development. <a href="https://smartconnections.app/introducing-pro-plugins/" target="_external">Learn more</a> about Pro plugins.</p>
      <section class="smart-plugins-list">
        <div class="pro-plugins-list"></div>
      </section>
      <h2>Account</h2>
      <section class="smart-plugins-login">
      </section>
    </div>
  `;
}

/**
 * Render Smart Plugins settings as a DocumentFragment.
 *
 * Scope can be SmartEnv or the host plugin. The component internally resolves both.
 *
 * @param {any} env
 * @param {object} [params]
 * @returns {DocumentFragment}
 */
export async function render(env, params = {}) {
  const html = build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}

/**
 * Wire up Obsidian Setting controls and Smart Plugins behavior.
 *
 * @param {any} env
 * @param {HTMLElement} container
 * @param {object} [params]
 * @returns {Promise<void>}
 */
export async function post_process(env, container, params = {}) { // eslint-disable-line no-unused-vars
  const plugin = env.plugin || null;
  const app = plugin?.app || window.app;

  const oauth_storage_prefix = get_oauth_storage_prefix(app);

  const login_container = container.querySelector('.smart-plugins-login');

  const pro_list_el = container.querySelector('.pro-plugins-list');


  const placeholders = derive_fallback_plugins();
  console.log('[smart_plugins] Fallback plugins:', placeholders);

  /**
   * Read installed plugin info from Obsidian.
   *
   * @returns {Promise<Record<string, {name:string, version:string}>>}
   */
  const get_installed_info = async () => {
    const installed_map = {};
    let { manifests } = app.plugins;
    // Wait for manifests to be loaded if needed
    while (Object.keys(manifests).length === 0) {
      manifests = app.plugins.manifests;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (const plugin_id in manifests) {
      if (!Object.prototype.hasOwnProperty.call(manifests, plugin_id)) continue;
      const { name, version } = manifests[plugin_id];
      installed_map[plugin_id] = { name, version };
    }
    return installed_map;
  };

  /**
   * Kick off OAuth login flow.
   *
   * Preferred:
   *   - Use env.initiate_smart_plugins_oauth() when available
   * Fallback:
   *   - Directly open /oauth with client_id=smart-plugins-app and
   *     redirect_uri=obsidian://smart-plugins/callback (legacy behavior).
   */
  const initiate_oauth_login = () => {
    // Prefer the shared SmartEnv OAuth helper if present
    if (env && typeof env.initiate_smart_plugins_oauth === 'function') {
      env.initiate_smart_plugins_oauth();
      new Notice('Please complete the login in your browser.');
      return;
    }
  };

  /**
   * Render login / logout controls into the login_container.
   */
  const render_oauth_login_section = () => {
    this.empty(login_container);
    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';

    if (!token) {
      // When login completes (via whichever OAuth handler owns the callback),
      // caller can re-open the settings and this component will pick up the token.
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

  /**
   * Install or update a plugin from Smart Plugins server.
   *
   * @param {{repo:string, name?:string, version?:string, manifest_id?:string, description?:string, resolve_download_url?:Function, download_url?:string}} item
   * @param {string} token
   */
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

  const install_plugin = async (item, token) => {
    try {
      const repo_name = item.repo;
      new Notice(`Installing "${repo_name}" ...`);

      const zip_data = await download_plugin_zip(item, token);
      const { files, pluginManifest } = await parse_zip_into_files(zip_data);

      let folder_name = '';
      if (pluginManifest?.id) {
        folder_name = pluginManifest.id.trim();
      } else if (item.manifest_id) {
        folder_name = item.manifest_id.trim();
      } else {
        folder_name = repo_name.replace('/', '_');
      }
      folder_name = folder_name.replace(/[^\w-]/g, '_');

      const base_folder = `${app.vault.configDir}/plugins/${folder_name}`;
      await write_files_with_adapter(app.vault.adapter, base_folder, files);

      // reload manifests
      await app.plugins.loadManifests();

      const plugin_id = pluginManifest?.id || item.manifest_id || folder_name;
      if (app.plugins.enabledPlugins.has(plugin_id)) {
        await app.plugins.disablePlugin(plugin_id);
      }
      await enable_plugin(app, plugin_id);

      new Notice(`${repo_name} installed successfully.`);
      await render_plugin_list_section();
    } catch (err) {
      console.error('[smart_plugins] Install error:', err);
      new Notice(`Install failed: ${err.message}`);
    }
  };


  /**
   * Fetch and display a plugin README in a modal.
   *
   * @param {string} repo
   * @param {string} token
   * @param {string} title
   */
  const show_plugin_readme = async (repo, token, title) => {
    try {
      const readme = await fetch_plugin_readme(repo, token);
      const modal = new Modal(app);
      modal.setTitle(title);
      await MarkdownRenderer.render(app, readme, modal.contentEl, '', new Component());
      modal.open();
    } catch (err) {
      console.error('[smart_plugins] Failed to load README:', err);
      new Notice('Failed to load README');
    }
  };

  /**
   * Render the fallback Smart Plugins list section when no token is present.
   *
   * - Uses static HTML skeleton from build_html (available + pro sections).
   * - Shows a message prompting user to log in for full catalog.
   */
  const render_fallback_plugin_list = async () => {
    this.empty(pro_list_el);

    if (placeholders.length > 0 && pro_list_el) {
      for (const item of placeholders) {
        console.log('[smart_plugins] Rendering fallback plugin item:', item);
        const row = new Setting(pro_list_el)
          .setName(item.name)
          .setDesc(item.description || 'Login to unlock Pro plugins.');

        row.addButton((btn) => {
          btn.setButtonText('Login to unlock');
          btn.onClick(() => initiate_oauth_login());
        });
      }
    }
  };

  /**
   * Render the Smart Plugins list section.
   *
   * - Shows "Loading available plugins..." while fetching.
   * - Lists installable / updatable plugins with Install/Update/Installed buttons.
   * - Falls back to static plugin list when user is not logged in.
   */
  const render_plugin_list_section = async () => {
    console.log('Rendering Smart Plugins list section...');
    this.empty(pro_list_el);
    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
    if (!token) {
      console.log('Rendered fallback Smart Plugins list section.', {token});
      await render_fallback_plugin_list();
      return
    }

    try {
      const installed_map = await get_installed_info();

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

      const { list = [], unauthorized = [] } = resp.json || {};
      console.log('[smart_plugins] Fetched plugin list:', list);

      if (!Array.isArray(list) || list.length === 0) {
        pro_list_el.textContent = 'No plugins found.';
      } else if (pro_list_el) {
        for (const item of list) {
          const repo_name = item.repo;
          const server_version = item.version || 'unknown';
          const plugin_id = item.manifest_id || repo_name.replace('/', '_');
          const local = installed_map[plugin_id] || null;
          const local_name = local ? local.name : null;
          const local_version = local ? local.version : null;
          const display_name = local_name || item.name || repo_name;

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

          const row = new Setting(pro_list_el)
            .setName(display_name)
            .setDesc(desc);

          row.addButton((btn) => {
            btn.setButtonText(button_label);
            btn.setDisabled(is_disabled);
            btn.onClick(() => install_plugin(item, token));
          });

          row.addButton((btn) => {
            btn.setButtonText('Learn more');
            btn.onClick(() => show_plugin_readme(item.repo, token, display_name));
          });
        }
      }

    } catch (err) {
      console.error('[smart_plugins] Failed to fetch plugin list:', err);
      pro_list_el.textContent = 'Error fetching plugin list. Check console.';
    }
    console.log('Rendered Smart Plugins list section.');
  };

  // Initial render
  const render_smart_plugins = async () => {
    render_oauth_login_section();
    await render_plugin_list_section();
  };

  env.events.on('smart_plugins_oauth_completed', () => {
    console.log('smart_plugins_oauth_completed event received');
    render_smart_plugins();
  });
  console.log('registered smart_plugins_oauth_completed listener');

  render_smart_plugins();
}
