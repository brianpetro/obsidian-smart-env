import { Setting, Notice, requestUrl, Modal, MarkdownRenderer, Component } from 'obsidian';
import {
  get_smart_server_url,
  parse_zip_into_files,
  write_files_with_adapter,
  is_server_version_newer,
  fetch_plugin_zip,
  fetch_plugin_readme,
  enable_plugin,
  derive_unauthorized_display,
  fetch_zip_from_url,
  derive_fallback_plugins,
} from '../utils/smart_plugins.js';
import { open_url_externally } from '../../utils/open_url_externally.js';

/**
 * Resolve SmartEnv + host plugin from the provided scope.
 *
 * Scope may be:
 *  - SmartEnv instance (has smart_view, plugin)
 *  - Host Obsidian Plugin instance (has app, env)
 *
 * @param {any} scope
 * @returns {{ env: any|null, plugin: any|null }}
 */
export function resolve_env_plugin(scope) {
  // SmartEnv instance: has smart_view + plugin
  if (scope && scope.smart_view && scope.plugin) {
    return {
      env: scope,
      plugin: scope.plugin,
    };
  }

  // Host plugin instance: has app + env
  if (scope && scope.app && scope.env) {
    return {
      env: scope.env,
      plugin: scope,
    };
  }

  // Fallbacks for partially‑wired scopes
  const env = scope?.env || scope || null;
  const plugin = scope?.plugin || scope?.env?.plugin || null;
  return { env, plugin };
}

/**
 * Compute the Smart Plugins OAuth storage prefix based on the vault name.
 *
 * Mirrors logic used by Smart Plugins OP / sc_oauth:
 *   `${vault_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_smart_plugins_oauth_`
 *
 * @param {import('obsidian').App} app
 * @returns {string}
 */
export function get_oauth_storage_prefix(app) {
  const vault_name = app?.vault?.getName?.() || '';
  const safe = vault_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${safe}_smart_plugins_oauth_`;
}

/**
 * Show/hide an element, using Obsidian's toggleClass when available.
 *
 * @param {HTMLElement|null} el
 * @param {boolean} hidden
 */
function set_element_hidden(el, hidden) {
  if (!el) return;
  if (typeof el.toggleClass === 'function') {
    el.toggleClass('is-hidden', hidden);
  } else if (el.classList) {
    if (hidden) {
      el.classList.add('is-hidden');
    } else {
      el.classList.remove('is-hidden');
    }
  }
}

/**
 * Set text on an element, using Obsidian's setText when present.
 *
 * @param {HTMLElement|null} el
 * @param {string} text
 */
function set_element_text(el, text) {
  if (!el) return;
  if (typeof el.setText === 'function') {
    el.setText(text);
  } else {
    el.textContent = text;
  }
}

/**
 * Build the static shell HTML for Smart Plugins settings.
 *
 * @param {any} _scope
 * @param {object} [_opts]
 * @returns {string}
 */
export function build_html(_scope, _opts = {}) {
  return `
    <div class="sc-smart-plugins-settings">
      <h2>Smart Plugins Settings</h2>

      <section class="sc-smart-plugins-login">
        <h3 class="sc-smart-plugins-login-title">Account</h3>
        <div class="sc-smart-plugins-login-body"></div>
      </section>

      <section class="sc-smart-plugins-list">
        <div class="sc-smart-plugins-loading is-hidden" aria-live="polite">
          Loading available plugins...
        </div>
        <div class="sc-smart-plugins-message is-hidden"></div>

        <section class="sc-smart-plugins-available is-hidden">
          <h3>Available Plugins</h3>
          <div class="sc-smart-plugins-available-list"></div>
        </section>

        <section class="sc-smart-plugins-pro is-hidden">
          <h3>Pro Plugins</h3>
          <div class="sc-smart-plugins-pro-list"></div>
        </section>

        <section class="sc-smart-plugins-locked is-hidden">
          <h3>Locked Plugins</h3>
          <div class="sc-smart-plugins-locked-list"></div>
        </section>
      </section>
    </div>
  `;
}

/**
 * Render Smart Plugins settings as a DocumentFragment.
 *
 * Scope can be SmartEnv or the host plugin. The component internally resolves both.
 *
 * @param {any} scope
 * @param {object} [opts]
 * @returns {DocumentFragment}
 */
export async function render(scope, opts = {}) {
  const html = build_html(scope, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, scope, container, opts);
  return container;
}

/**
 * Wire up Obsidian Setting controls and Smart Plugins behavior.
 *
 * @param {any} scope
 * @param {HTMLElement} container
 * @param {object} [opts]
 * @returns {Promise<void>}
 */
export async function post_process(scope, container, params = {}) { // eslint-disable-line no-unused-vars
  if (!container) {
    console.warn('[smart_plugins] post_process called without container.');
    return;
  }

  const { env, plugin } = resolve_env_plugin(scope);

  if (!plugin) {
    console.warn('[smart_plugins] Missing plugin or app; aborting render.');
    return;
  }

  const app = plugin.app || window.app;
  const oauth_storage_prefix = get_oauth_storage_prefix(app);

  const login_section = container.querySelector('.sc-smart-plugins-login');
  const login_container = (login_section && login_section.querySelector('.sc-smart-plugins-login-body')) || login_section || container;

  const list_section = container.querySelector('.sc-smart-plugins-list');
  const loading_el = list_section?.querySelector('.sc-smart-plugins-loading') || null;
  const message_el = list_section?.querySelector('.sc-smart-plugins-message') || null;

  const available_section = list_section?.querySelector('.sc-smart-plugins-available') || null;
  const available_list_el = list_section?.querySelector('.sc-smart-plugins-available-list') || null;

  const pro_section = list_section?.querySelector('.sc-smart-plugins-pro') || null;
  const pro_list_el = list_section?.querySelector('.sc-smart-plugins-pro-list') || null;

  const locked_section = list_section?.querySelector('.sc-smart-plugins-locked') || null;
  const locked_list_el = list_section?.querySelector('.sc-smart-plugins-locked-list') || null;

  const fallback_plugins = derive_fallback_plugins();

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
    if (!login_container) return;

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
    if (!list_section) return;

    this.empty(available_list_el);
    this.empty(pro_list_el);
    this.empty(locked_list_el);

    set_element_hidden(available_section, true);
    set_element_hidden(pro_section, true);
    set_element_hidden(locked_section, true);
    set_element_hidden(loading_el, true);

    const public_plugins = fallback_plugins.filter((item) => !item.locked);
    const placeholders = fallback_plugins.filter((item) => item.locked);

    if (public_plugins.length > 0 && available_list_el) {
      set_element_hidden(available_section, false);
      for (const item of public_plugins) {
        const row = new Setting(available_list_el)
          .setName(item.name || item.repo)
          .setDesc(item.description || 'Install without logging in.');

        row.addButton((btn) => {
          btn.setButtonText('Install');
          btn.onClick(() => install_plugin(item, ''));
        });
      }
    }

    if (placeholders.length > 0 && pro_list_el) {
      set_element_hidden(pro_section, false);
      for (const item of placeholders) {
        const row = new Setting(pro_list_el)
          .setName(item.name)
          .setDesc(item.description || 'Login to unlock Pro plugins.');

        row.addButton((btn) => {
          btn.setButtonText('Login to unlock');
          btn.onClick(() => initiate_oauth_login());
        });
      }
    }

    if (message_el) {
      set_element_text(message_el, 'Log in to access the full Smart Plugins catalog.');
      set_element_hidden(message_el, false);
    }
  };

  /**
   * Render the Smart Plugins list section.
   *
   * - Shows "Loading available plugins..." while fetching.
   * - Lists installable / updatable plugins with Install/Update/Installed buttons.
   * - Shows locked plugins section from `unauthorized`.
   * - Falls back to static plugin list when user is not logged in.
   */
  const render_plugin_list_section = async () => {
    if (!list_section) return;

    this.empty(available_list_el);
    this.empty(pro_list_el);
    this.empty(locked_list_el);

    set_element_hidden(available_section, true);
    set_element_hidden(pro_section, true);
    set_element_hidden(locked_section, true);

    if (message_el) {
      set_element_text(message_el, '');
      set_element_hidden(message_el, true);
    }

    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
    if (!token) {
      await render_fallback_plugin_list();
      return;
    }

    if (loading_el) {
      set_element_text(loading_el, 'Loading available plugins...');
      set_element_hidden(loading_el, false);
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

      if (loading_el) {
        set_element_hidden(loading_el, true);
      }

      const { list = [], unauthorized = [] } = resp.json || {};

      if (!Array.isArray(list) || list.length === 0) {
        if (message_el) {
          set_element_text(message_el, 'No plugins found.');
          set_element_hidden(message_el, false);
        }
        set_element_hidden(available_section, true);
      } else if (available_list_el) {
        set_element_hidden(available_section, false);

        for (const item of list) {
          const repo_name = item.repo;
          const server_version = item.version || 'unknown';
          const plugin_id = item.manifest_id || repo_name.replace('/', '_');

          // Avoid offering to "manage" this managing environment itself by id if needed
          if (plugin_id === 'smart-plugins') {
            continue;
          }

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

          const row = new Setting(available_list_el)
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

      const unauthorized_items = derive_unauthorized_display(unauthorized);
      if (unauthorized_items.length > 0 && locked_list_el) {
        set_element_hidden(locked_section, false);
        for (const item of unauthorized_items) {
          const setting = new Setting(locked_list_el).setName(item.name);
          setting.addButton((btn) => {
            btn.setButtonText('Learn more');
            btn.onClick(() => open_url_externally(plugin, item.link));
          });
        }
      } else {
        set_element_hidden(locked_section, true);
      }
    } catch (err) {
      console.error('[smart_plugins] Failed to fetch plugin list:', err);
      if (message_el) {
        set_element_text(message_el, 'Error fetching plugin list. Check console.');
        set_element_hidden(message_el, false);
      }
    } finally {
      if (loading_el) {
        set_element_hidden(loading_el, true);
      }
    }
  };

  // Initial render
  const render_smart_plugins = async () => {
    render_oauth_login_section();
    await render_plugin_list_section();
  };

  env.events.on('smart_plugins_oauth_completed', async () => {
    console.log('smart_plugins_oauth_completed event received');
    await render_smart_plugins();
  });
  console.log('registered smart_plugins_oauth_completed listener');

  await render_smart_plugins();
}
