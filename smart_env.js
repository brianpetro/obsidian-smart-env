import {
  Notice,
  Platform,
  TFile,
} from 'obsidian';
import { SmartEnv as BaseSmartEnv } from 'smart-environment';
import { merge_env_config } from 'smart-environment/utils/merge_env_config.js';
import default_config from './default.config.js';
import {
  add_smart_icons,
  add_smart_chat_icon,
  add_smart_connections_icon,
  add_smart_lookup_icon,
} from './utils/add_icons.js';
import { SmartNotices } from 'smart-notices/smart_notices.js';
import { exchange_code_for_tokens, install_smart_plugins_plugin, get_smart_server_url, enable_plugin } from './utils/sc_oauth.js';
import { register_completion_variable_adapter_replacements } from './utils/register_completion_variable_adapter_replacements.js';
import { remove_smart_plugins_plugin } from './migrations/remove_smart_plugins_plugin.js';
import { register_first_of_event_notifications } from './src/utils/onboarding_events.js';
import { render as render_status_bar_component } from './src/components/status_bar.js';
import { EnvStatusView } from './src/views/env_status_view.js';
import { SmartEnvSettingTab } from './src/views/smart_env_settings_tab.js';
import { compare_versions } from 'smart-environment/utils/compare_versions.js';

export class SmartEnv extends BaseSmartEnv {
  constructor(opts = {}) {
    super(opts);
    this.plugin_states = {};
  }
  /**
   * Creates and initializes a SmartEnv instance tailored for Obsidian.
   * @deprecated 2026-03-31 This code is so stinky I cringe. It will be replaced in next major version. Continue using but expect replacement. Do not depend on returned SmartEnv instance.
   * @param {Object} plugin - The Obsidian plugin instance.
   * @param {Object} [env_config] - Required environment configuration object.
   * @returns {Promise<SmartEnv>} The initialized SmartEnv instance.
   */
  static async create(plugin, env_config) {
    if (!plugin) throw new Error("SmartEnv.create: 'plugin' parameter is required.");
    if (!env_config) throw new Error("SmartEnv.create: 'env_config' parameter is required.");
    env_config.version = this.version;
    add_smart_chat_icon();
    add_smart_connections_icon();
    add_smart_lookup_icon();
    add_smart_icons();

    const opts = merge_env_config(env_config, default_config);
    opts.env_path = ''; // scope handled by Obsidian FS methods
    const plugin_id = plugin?.manifest?.id || 'unknown-plugin';
    // Handle already initiated smart_env with deprecated version
    const global_version_pcs = this.global_env.constructor.version.split('.');
    const global_minor = parseInt(global_version_pcs[1] || '0');
    if (this.global_env && this.global_env.state === 'init' &&
      compare_versions(this.global_env.constructor.version, this.version) === -1 // old existing
      && global_minor < 4 
    ) {
      // remove smart_env_configs from older versions
      const smart_env_config_keys = Object.keys(this.smart_env_configs);
      for (let i = 0; i < smart_env_config_keys.length; i++) {
        const _config = this.smart_env_configs[smart_env_config_keys[i]];
        const _config_env_version = _config.opts.version;
        if (!_config_env_version.startsWith('2.4') && !(_config_env_version.startsWith('2.5'))) {
          console.log(`Removing deprecated smart_env_config for version ${_config_env_version} at key "${smart_env_config_keys[i]}"`);
          const notice_frag = document.createDocumentFragment();
          notice_frag.createEl('p', { text: `Detected outdated ${smart_env_config_keys[i]} in Smart Environment.` });
          notice_frag.createEl('p', { text: `Please update ${smart_env_config_keys[i]} then restart Obsidian to load all Smart Plugins.` });
          if(!this.global_env.is_pro) {
            notice_frag.createEl('button', { text: 'Check for Updates' }).addEventListener('click', () => {
              plugin.app.plugins.checkForUpdates().then(() => {
                plugin.app.setting.openTabById('community-plugins');
              });
              plugin.app.setting.open();
            });
          }
          new Notice(notice_frag, 0); // DEPRECATED: here because no notices shown on events.emit in earlier versions
          _config.main?.unload?.(); // removes settings tab and other registrations (ribbon icons)
          delete this.smart_env_configs[smart_env_config_keys[i]]; // this should be handled by unload but here for redundancy during transition period
        }
      }
      // DOES NOT HALT & NO NEED TO DELETE GLOBAL ENV HERE: super.create will replace global_env
    }
    if (this.global_env && this.global_env.state !== 'init') {
      const notice_message = `Restart Obsidian to load ${plugin_id} into the Smart Environment.`;
      console.warn(`SmartEnv: Detected existing environment in "${this.global_env.state}" state. ${notice_message}`);
      this.global_env.events.emit('smart_env:restart_required', {
        level: 'attention',
        plugin_id,
        message: notice_message,
        event_source: 'SmartEnv.create',
        btn_text: 'Restart Obsidian',
        btn_callback: 'app:reload',
      });
      if (!this.global_env.plugin_states) this.global_env.plugin_states = {};
      this.global_env.plugin_states[plugin_id] = 'deferred';
      this.create_env_getter(plugin);
      return this.global_env;
    }

    const env = await super.create(plugin, opts);
    clearTimeout(env.load_timeout); // prevent base-level load in favor of using onLayoutReady for better timing with Obsidian's startup process
    env.load_timeout = null;

    if (!env._startup_load_registration) {
      env._startup_load_registration = true;
      plugin.registerEvent(plugin.app.workspace.onLayoutReady(async () => {
        if (env.state !== 'init') {
          console.warn(`Skipping SmartEnv (v${env.constructor.version}) load on layout ready; env.state: "${env.state}".`);
          return;
        }
        const continue_load = await env.before_load()
        if (continue_load === false) {
          console.warn('SmartEnv before_load returned false, skipping load.');
          return;
        }
        await env.load(); // calls after_load internally and sets state to 'loaded' at the end
      }));
    }

    return env;
  }

  async before_load() {
    this.run_migrations();
    this.register_notification_dispatchers();
    this.register_env_item_views();
    this.register_env_settings_tab();
  
    if (typeof this._onboarding_events_teardown !== 'function') {
      this._onboarding_events_teardown = register_first_of_event_notifications(this);
    }
  
    if (!this.plugin.app.workspace.protocolHandlers.has('smart-plugins/callback')) {
      // Register protocol handler for obsidian://smart-plugins/callback
      this.plugin.registerObsidianProtocolHandler('smart-plugins/callback', async (params) => {
        await this.handle_smart_plugins_oauth_callback(params);
      });
    }
    if(Platform.isDesktop) this.register_status_bar();
  
    if (Platform.isMobile && this.state !== 'loaded') {
      const frag = this.smart_view.create_doc_fragment(
        '<div><p>Smart Environment loading deferred on mobile.</p><button>Load Smart Environment</button></div>',
      );
      frag.querySelector('button').addEventListener('click', () => {
        this.start_mobile_env_load({ source: 'mobile_deferred_notice' });
      });
      new Notice(frag, 0);
      return false;
    }
  
    return true;
  }

  async after_load() {
    this.smart_sources?.register_source_watchers?.(this.smart_sources);
    this.register_workspace_source_events();

    if (this._config.collections.smart_completions?.completion_adapters?.SmartCompletionVariableAdapter) {
      register_completion_variable_adapter_replacements(this._config.collections.smart_completions.completion_adapters.SmartCompletionVariableAdapter);
    }

    this.register_configured_modals();
    this.refresh_status_bar();

    if (!this._registered_browse_smart_plugins_command) {
      this._registered_browse_smart_plugins_command = this.plugin.manifest?.id + ':browse-smart-plugins';
      this.plugin.addCommand({
        id: 'browse-smart-plugins',
        name: 'Browse Smart Plugins',
        callback: () => {
          this.events.emit('smart_plugins:browse', {
            event_source: 'command_palette',
          });
        },
      });
    }

  }

  unload() {
    if (typeof this._onboarding_events_teardown === 'function') {
      this._onboarding_events_teardown();
      this._onboarding_events_teardown = null;
    }
    this._workspace_source_events_registered = false;
    return super.unload?.();
  }

  /**
   * Register event dispatchers used by native notice buttons and event-first flows.
   *
   * @returns {void}
   */
  register_notification_dispatchers() {
    if (this._notification_dispatchers_registered) return;
    this._notification_dispatchers_registered = true;

    this.events.on('milestones_modal:open', () => {
      this.open_milestones_modal?.();
    });

    this.events.on('notifications_feed_modal:open', () => {
      this.open_notifications_feed_modal?.();
    });

    this.events.on('smart_plugins:browse', () => {
      this.browse_smart_plugins?.();
    });

    this.events.on('smart_env:load_mobile_requested', () => {
      this.start_mobile_env_load({ source: 'native_notice_button' });
    });
  }

  /**
   * Register environment-owned item views once per plugin.
   * @returns {void}
   */
  register_env_item_views() {
    const plugin = this.main;
    if (!plugin?.registerView) return;

    if (!(this._registered_env_item_views instanceof Set)) {
      this._registered_env_item_views = new Set();
    }

    const plugin_key = plugin.manifest?.id || 'unknown-plugin';
    const view_classes = [EnvStatusView];

    view_classes.forEach((ViewClass) => {
      const registration_key = `${plugin_key}:${ViewClass.view_type}`;
      if (this._registered_env_item_views.has(registration_key)) return;

      try {
        ViewClass.register_item_view(plugin);
        this._registered_env_item_views.add(registration_key);
      } catch (error) {
        console.error(`Failed to register item view "${ViewClass.view_type}"`, error);
      }
    });
  }

  /**
   * Open the mobile-friendly status view item view.
   *
   * @param {object} [params={}]
   * @returns {void}
   */
  open_env_status_view(params = {}) {
    this.register_env_item_views();
    EnvStatusView.open(this.obsidian_app.workspace, params);
  }

  get env_status_view_command_id() {
    const command_id = this._registered_env_item_views.find((id) => id.endsWith(EnvStatusView.view_type));
    console.log({ command_id });
    return command_id || this.plugin.manifest?.id + ':' + EnvStatusView.view_type;
  }


  /**
   * Centralized mobile load flow used by native notices, settings tabs, and views.
   * Opens the persistent progress surface first, then starts loading if needed.
   *
   * @param {object} [params={}]
   * @param {boolean} [params.open_progress_view=true]
   * @returns {Promise<SmartEnv>|SmartEnv}
   */
  async start_mobile_env_load(params = {}) {
    const {
      open_progress_view = true,
    } = params;

    if (open_progress_view) {
      this.open_env_status_view({ active: true });
    }

    if (this.state === 'loaded') {
      this.refresh_status_bar();
      return this;
    }

    if (this.state === 'loading' && this._load_promise) {
      return this._load_promise;
    }

    await this.load();
    await this.after_load();
    return this;
  }

  /**
   * Register every modal declared in config that exposes a static register_modal helper.
   * @returns {void}
   */
  register_configured_modals() {
    const modal_entries = Object.entries(this._config?.modals || {});
    if (!this._registered_modal_keys) {
      this._registered_modal_keys = new Set();
    }

    for (const [modal_key, modal_config] of modal_entries) {
      const ModalClass = modal_config?.class;
      if (typeof ModalClass?.register_modal !== 'function') continue;
      if (this._registered_modal_keys.has(modal_key)) continue;

      try {
        ModalClass.register_modal(this.main);
        this._registered_modal_keys.add(modal_key);
      } catch (error) {
        console.error(`Failed to register modal "${modal_key}"`, error);
      }
    }
  }

  register_workspace_source_events() {
    if (this._workspace_source_events_registered) return;
    const plugin = this.main;
    if (!plugin?.registerEvent) return;

    this._workspace_source_events_registered = true;
    plugin.registerEvent(
      plugin.app.workspace.on('active-leaf-change', (leaf) => {
        this.smart_sources?.debounce_re_import_queue?.();
        const current_path = leaf.view?.file?.path;
        this.emit_source_opened(current_path, 'active-leaf-change');
      }),
    );
    plugin.registerEvent(
      plugin.app.workspace.on('file-open', (file) => {
        this.smart_sources?.debounce_re_import_queue?.();
        const current_path = file?.path;
        this.emit_source_opened(current_path, 'file-open');
      }),
    );
  }

  emit_source_opened(current_path, event_source = null) {
    if (this._current_opened_source === current_path) return; // prevent duplicate events
    const current_source = this.smart_sources.get(current_path);
    if (current_source) {
      this._current_opened_source = current_path;
      current_source.emit_event('sources:opened', { event_source });
    }
  }

  queue_source_re_import(source) {
    this.smart_sources?.queue_source_re_import?.(source);
  }

  debounce_re_import_queue() {
    this.smart_sources?.debounce_re_import_queue?.();
  }

  async run_re_import() {
    await this.smart_sources?.run_re_import?.();
  }

  register_status_bar() {
    const add_status_bar_item = this.main?.addStatusBarItem?.bind(this.main);
    if (typeof add_status_bar_item !== 'function') return;

    const status_container = this.main?.app?.statusBar?.containerEl;
    const existing_status_item = status_container
      ?.querySelector?.('.smart-env-status-container')
      ?.closest?.('.status-bar-item')
    ;

    if (existing_status_item && this.status_elm !== existing_status_item) {
      existing_status_item.remove?.();
    }

    if (!this.status_elm || !this.status_elm.isConnected) {
      this.status_elm = add_status_bar_item();
    }

    this.refresh_status_bar();
  }

  refresh_status_bar() {
    if (!this.status_elm) return;
    render_status_bar_component.call(this.smart_view, this)
      .then((container) => {
        this.status_elm.empty?.();
        this.status_elm.appendChild(container);
      })
      .catch((error) => {
        console.error('Failed to render Smart Env status bar', error);
      })
    ;
  }

  /**
   * @deprecated 2026-03-17 remove by next major release (keeping for backward compatibility during migration period)
   */
  get notices() {
    if (!this._notices) {
      this._notices = new SmartNotices(this, {
        adapter: Notice,
      });
    }
    return this._notices;
  }

  // Smart Plugins

  /**
   * Handles the OAuth callback from the Smart Plugins server.
   * @param {Object} params - The URL parameters from the OAuth callback.
   */
  async handle_smart_plugins_oauth_callback(params) {
    const code = params.code;
    if (!code) {
      this.events.emit('smart_plugins_oauth_failed', {
        level: 'error',
        message: 'No OAuth code provided in URL. Login failed.',
        event_source: 'handle_smart_plugins_oauth_callback',
      });
      return;
    }
    try {
      await exchange_code_for_tokens(code, this.plugin);
      this.events.emit('smart_plugins_oauth_completed');
    } catch (err) {
      console.error('OAuth callback error', err);
      this.events.emit('smart_plugins_oauth_failed', {
        level: 'error',
        message: `OAuth callback error: ${err.message}`,
        details: err.stack || '',
        event_source: 'handle_smart_plugins_oauth_callback',
      });
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
    await new Promise((r) => setTimeout(r, 3000)); // wait 3 seconds for other processes to finish
    await this.wait_for_obsidian_sync();
  }

  async wait_for_obsidian_sync() {
    while (this.obsidian_is_syncing) {
      console.log('Smart Connections: Waiting for Obsidian Sync to finish');
      await new Promise((r) => setTimeout(r, 1000));
      if (!this.plugin) throw new Error('Plugin disabled while waiting for obsidian sync, reload required.'); // if plugin is disabled, stop waiting for sync
    }
  }

  get obsidian_is_syncing() {
    const obsidian_sync_instance = this.plugin?.app?.internalPlugins?.plugins?.sync?.instance;
    if (!obsidian_sync_instance) return false; // if no obsidian sync instance, not syncing
    if (obsidian_sync_instance?.syncStatus.startsWith('Uploading')) return false; // if uploading, don't wait for obsidian sync
    if (obsidian_sync_instance?.syncStatus.startsWith('Fully synced')) return false; // if fully synced, don't wait for obsidian sync
    return obsidian_sync_instance?.syncing;
  }

  get obsidian_app() {
    return this.plugin?.app ?? window.app;
  }

  open_notifications_feed_modal() {
    const NotificationsModalClass = this.config.modals.notifications_feed_modal.class;
    const modal = new NotificationsModalClass(this.obsidian_app, this);
    modal.open();
  }

  open_milestones_modal() {
    const MilestonesModalClass = this.config.modals.milestones_modal.class;
    const modal = new MilestonesModalClass(this.obsidian_app, this);
    modal.open();
  }

  browse_smart_plugins() {
    const BrowseSmartPluginsClass = this.config?.modals?.browse_plugins_modal?.class;
    if (typeof BrowseSmartPluginsClass !== 'function') return;
    const modal = new BrowseSmartPluginsClass(this.obsidian_app, this);
    modal.open();
  }

  run_migrations() {
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-plugins'] });
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-editor'] });
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-sources'] });
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-claude'] });
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-gemini'] });
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-deepseek'] });
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-perplexity'] });
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-grok'] });
    remove_smart_plugins_plugin({ app: this.plugin.app, plugin_ids: ['smart-aistudio'] });
  }

  // Detect Existing Smart Environment Settings Tab
  get env_settings_tab() {
    const app = this.plugin.app || window.app;
    return app.setting.pluginTabs.find(t => t.id === 'smart-environment');
  }
  register_env_settings_tab() {
    if (this.env_settings_tab) return;
    this.plugin.addSettingTab(new SmartEnvSettingTab(this.plugin.app, this.plugin));
  }
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