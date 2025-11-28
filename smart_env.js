import {
  Notice,
  Platform,
  TFile,
} from 'obsidian';
import { SmartEnv as BaseSmartEnv } from 'smart-environment';
import { merge_env_config } from 'smart-environment/utils/merge_env_config.js';
import default_config from './default.config.js';
import { add_smart_chat_icon, add_smart_connections_icon, add_smart_lookup_icon } from './utils/add_icons.js';
import { SmartNotices } from "smart-notices/smart_notices.js"; // TODO: move to jsbrains
import { exchange_code_for_tokens, install_smart_plugins_plugin, get_smart_server_url, enable_plugin } from './utils/sc_oauth.js';
import { open_url_externally } from "./utils/open_url_externally.js";
import { register_completion_variable_adapter_replacements } from './utils/register_completion_variable_adapter_replacements.js';
import { remove_smart_plugins_plugin } from './migrations/remove_smart_plugins_plugin.js';

export class SmartEnv extends BaseSmartEnv {
  static async create(plugin, main_env_opts = null) {
    add_smart_chat_icon();
    add_smart_connections_icon();
    add_smart_lookup_icon();
    if(!main_env_opts) main_env_opts = plugin.smart_env_config;
    // Special handling for old Obsidian smart environments
    // Detect if environment has 'init_main'
    if (plugin.app.plugins.plugins['smart-connections']
        && plugin.app.plugins.plugins['smart-connections'].env
        && !plugin.app.plugins.plugins['smart-connections'].env.constructor.version
    ) {
      const update_notice = "Detected older SmartEnv with 'init_main'. Reloading without the outdated plugin. Please update Smart Connections.";
      // Attempt a user-visible notice if Obsidian's Notice is in scope, otherwise warn:
      console.warn(update_notice);
      new Notice(update_notice, 0);
      disable_plugin(plugin.app, 'smart-connections');
    }

    const opts = merge_env_config(main_env_opts, default_config);
    opts.env_path = ''; // scope handled by Obsidian FS methods
    return await super.create(plugin, opts);
  }
  async load(force_load = false) {
    this.run_migrations();
    if(!Platform.isMobile && !this.plugin.app.workspace.protocolHandlers.has('smart-plugins/callback')) {
      // Register protocol handler for obsidian://smart-plugins/callback
      this.plugin.registerObsidianProtocolHandler("smart-plugins/callback", async (params) => {
        await this.handle_smart_plugins_oauth_callback(params);
      });
    }
    if(Platform.isMobile && !force_load){
      // create doc frag with a button to run load_env
      const frag = this.smart_view.create_doc_fragment(`<div><p>Smart Environment loading deferred on mobile.</p><button>Load Environment</button></div>`);
      frag.querySelector('button').addEventListener('click', () => {
        this.load(true);
      });
      new Notice(frag, 0);
      return;
    }
    await super.load();
    this.smart_sources?.register_source_watchers?.(this.smart_sources);
    const plugin = this.main;
    plugin.registerEvent(
      plugin.app.workspace.on('active-leaf-change', (leaf) => {
        this.smart_sources?.debounce_re_import_queue?.();
        const current_path = leaf.view?.file?.path;
        this.emit_source_opened(current_path, 'active-leaf-change');
      })
    );
    plugin.registerEvent(
      plugin.app.workspace.on('file-open', (file) => {
        this.smart_sources?.debounce_re_import_queue?.();
        const current_path = file?.path;
        this.emit_source_opened(current_path, 'file-open');
      })
    );
    register_completion_variable_adapter_replacements(this._config.collections.smart_completions.completion_adapters.SmartCompletionVariableAdapter);
    // register modals
    const ContextModal = this._config.modals.context_selector.class;
    ContextModal.register_modal(this.main);
    // register status bar
    this.register_status_bar();
  }
  emit_source_opened(current_path, event_source=null) {
    if (this._current_opened_source === current_path) return; // prevent duplicate events
    const current_source = this.smart_sources.get(current_path);
    if(current_source) {
      this._current_opened_source = current_path;
      current_source.emit_event('sources:opened', { event_source });
    }
  }
  // queue re-import the file
  queue_source_re_import(source) {
    this.smart_sources?.queue_source_re_import?.(source);
  }

  // prevent importing when user is acting within the workspace
  debounce_re_import_queue() {
    this.smart_sources?.debounce_re_import_queue?.();
  }

  async run_re_import() {
    await this.smart_sources?.run_re_import?.();
  }

  register_status_bar() {
    const status_container = this.main?.app?.statusBar?.containerEl;
    status_container
      ?.querySelector?.('.smart-env-status-container')
      ?.closest?.('.status-bar-item')
      ?.remove?.()
    ;
    this.status_elm = this.main.addStatusBarItem();
    this.smart_components?.render_component('status_bar', this).then((container) => {
      this.status_elm.empty?.();
      this.status_elm.appendChild(container);
    });
  }

  /**
   * @deprecated see events
   */
  get notices() {
    if(!this._notices) {
      this._notices = new SmartNotices(this, {
        adapter: Notice,
      });
    }
    return this._notices;
  }
  get settings_config() {
    const config = super.settings_config;
    delete config['is_obsidian_vault'];
    config['re_import_wait_time'] = {
      type: 'number',
      name: 'Re-import wait time',
      description: 'Time in seconds to wait before re-importing a file after modification.',
    };
    return config;
  }
  // Smart Plugins
  /**
   * This is the function that is called by the new "Sign in with Smart Plugins" button.
   * It replicates the old 'initiate_oauth()' logic from sc_settings_tab.js
   */
  initiate_smart_plugins_oauth() {
    console.log("initiate_smart_plugins_oauth");
    const state = Math.random().toString(36).slice(2);
    const redirect_uri = encodeURIComponent("obsidian://smart-plugins/callback");
    const url = `${get_smart_server_url()}/oauth?client_id=smart-plugins-op&redirect_uri=${redirect_uri}&state=${state}`;
    open_url_externally(this.plugin, url);
  }
  /**
   * Handles the OAuth callback from the Smart Plugins server.
   * @param {Object} params - The URL parameters from the OAuth callback.
   */
  async handle_smart_plugins_oauth_callback(params) {
    const code = params.code;
    if (!code) {
      new Notice("No OAuth code provided in URL. Login failed.");
      return;
    }
    try {
      // your existing OAuth + plugin install logic
      await exchange_code_for_tokens(code, this.plugin);
      this.events.emit('smart_plugins_oauth_completed');
    } catch (err) {
      console.error("OAuth callback error", err);
      new Notice(`OAuth callback error: ${err.message}`);
    }
  }
  /**
   * Serializes the environment and, when in a browser, triggers a download.
   * @param {string} [filename='smart_env.json']
   * @returns {string} stringified JSON
   */
  export_json(filename = 'smart_env.json') {
    const json = JSON.stringify(this.to_json(), null, 2);
    if (typeof document !== 'undefined') {
      download_json(json, filename);
    }
    return json;
  }
  // WAIT FOR OBSIDIAN SYNC
  async ready_to_load_collections() {
    await new Promise(r => setTimeout(r, 3000)); // wait 3 seconds for other processes to finish
    await this.wait_for_obsidian_sync();
  }
  async wait_for_obsidian_sync() {
    while (this.obsidian_is_syncing) {
      console.log("Smart Connections: Waiting for Obsidian Sync to finish");
      await new Promise(r => setTimeout(r, 1000));
      if(!this.plugin) throw new Error("Plugin disabled while waiting for obsidian sync, reload required."); // if plugin is disabled, stop waiting for sync
    }
  }
  get obsidian_is_syncing() {
    const obsidian_sync_instance = this.plugin?.app?.internalPlugins?.plugins?.sync?.instance;
    if(!obsidian_sync_instance) return false; // if no obsidian sync instance, not syncing
    if(obsidian_sync_instance?.syncStatus.startsWith('Uploading')) return false; // if uploading, don't wait for obsidian sync
    if(obsidian_sync_instance?.syncStatus.startsWith('Fully synced')) return false; // if fully synced, don't wait for obsidian sync
    return obsidian_sync_instance?.syncing;
  }
  // get obsidian app instance
  get obsidian_app() {
    return this.plugin?.app ?? window.app;
  }
  // open notifications feed modal
  open_notifications_feed_modal() {
    const NotificationsModalClass = this.config.modals.notifications_feed_modal.class;
    const modal = new NotificationsModalClass(this.obsidian_app, this);
    modal.open();
  }
  run_migrations () {
    // remove old smart-plugins plugin if present
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-plugins'] });
  }
}

async function disable_plugin(app, plugin_id) {
  console.log('disabling plugin ' + plugin_id);
  await app.plugins.unloadPlugin(plugin_id);
  await app.plugins.disablePluginAndSave(plugin_id);
  await app.plugins.loadManifests();
}
/**
 * Triggers a browser download for the provided JSON string.
 * @param {string} json
 * @param {string} filename
 */
function download_json(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}