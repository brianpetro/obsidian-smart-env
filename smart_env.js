import { 
  Notice,
  Platform,
  TFile,
  setIcon,
} from 'obsidian';
import { SmartEnv as BaseSmartEnv } from 'smart-environment';
import { merge_env_config } from 'smart-environment/utils/merge_env_config.js';
import default_config from './default.config.js';
import { add_smart_chat_icon, add_smart_connections_icon } from './utils/add_icons.js';
import { SmartNotices } from "smart-notices/smart_notices.js"; // TODO: move to jsbrains
import styles from './styles.css' with { type: 'css' };
import { exchange_code_for_tokens, install_smart_plugins_plugin, get_smart_server_url, enable_plugin } from './sc_oauth.js';
import { open_url_externally } from "./utils/open_url_externally.js";


export class SmartEnv extends BaseSmartEnv {
  static async create(plugin, main_env_opts = null) {
    add_smart_chat_icon();
    add_smart_connections_icon();
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
    return await super.create(plugin, opts);
  }
  async load(force_load = false) {
    if(!Platform.isMobile && !this.plugin.app.workspace.protocolHandlers.has('sc-op/callback')) {
      // Register protocol handler for obsidian://sc-op/callback
      this.plugin.registerObsidianProtocolHandler("sc-op/callback", async (params) => {
        await this.handle_sc_op_oauth_callback(params);
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
    // register event listeners for file changes after load
    const plugin = this.main;
    plugin.registerEvent(
      plugin.app.vault.on('create', (file) => {
        if(file instanceof TFile && this.smart_sources?.source_adapters?.[file.extension]){
          const source = this.smart_sources?.init_file_path(file.path);
          if(source) this.smart_sources?.fs.include_file(file.path);
        }
      })
    );
    plugin.registerEvent(
      plugin.app.vault.on('rename', (file, old_path) => {
        if(file instanceof TFile && this.smart_sources?.source_adapters?.[file.extension]){
          const source = this.smart_sources?.init_file_path(file.path);
          if(source) this.smart_sources?.fs.include_file(file.path);
        }
        if(old_path){
          const source = this.smart_sources?.get(old_path);
          if(source) {
            source.delete();
            // debounce save queue
            if (this.rename_debounce_timeout) clearTimeout(this.rename_debounce_timeout);
            this.rename_debounce_timeout = setTimeout(() => {
              this.smart_sources?.process_save_queue();
              this.rename_debounce_timeout = null;
            }, 1000);
          }
        }
      })
    );
    plugin.registerEvent(
      plugin.app.vault.on('modify', (file) => {
        if(file instanceof TFile && this.smart_sources?.source_adapters?.[file.extension]){
          if(!this.sources_re_import_queue) this.sources_re_import_queue = {};
          if(this.sources_re_import_queue?.[file.path]) return; // already in queue
          // queue re-import the file
          const source = this.smart_sources?.get(file.path);
          if(source){
            source.data.last_import = { at: 0, hash: null, mtime: 0, size: 0 };
            this.sources_re_import_queue[source.key] = source;
            this.debounce_re_import_queue();
          }
        }
      })
    );
    plugin.registerEvent(
      plugin.app.workspace.on('editor-change', () => {
        this.debounce_re_import_queue();
      })
    );
    plugin.registerEvent(
      plugin.app.workspace.on('active-leaf-change', () => {
        this.debounce_re_import_queue();
      })
    );
    plugin.registerEvent(
      plugin.app.vault.on('delete', (file) => {
        if(file instanceof TFile && this.smart_sources?.source_adapters?.[file.extension]){
          delete this.smart_sources?.items[file.path];
        }
      })
    );
    this.refresh_status();
  }
  debounce_re_import_queue() {
    this.refresh_status();
    this.sources_re_import_halted = true; // halt re-importing
    if (this.sources_re_import_timeout) clearTimeout(this.sources_re_import_timeout);
    if(!this.sources_re_import_queue || Object.keys(this.sources_re_import_queue).length === 0) {
      this.sources_re_import_timeout = null;
      return; // nothing to re-import
    }
    this.sources_re_import_timeout = setTimeout(this.run_re_import.bind(this), this.settings.re_import_wait_time * 1000);
  }

  async run_re_import() {
    this.sources_re_import_halted = false;
    const queue_length = Object.keys(this.sources_re_import_queue || {}).length;
    if (queue_length) {
      for (const [key, src] of Object.entries(this.sources_re_import_queue)) {
        await src.import();
        // Build embed queue to prevent scanning all sources on process_embed_queue
        if (!this.smart_sources._embed_queue) this.smart_sources._embed_queue = [];
        this.smart_sources._embed_queue.push(src);
        if (this.smart_blocks.settings.embed_blocks) {
          for (const block of src.blocks) {
            if (block._queue_embed || (block.should_embed && block.is_unembedded)) {
              this.smart_sources._embed_queue.push(block);
              block._queue_embed = true; // mark for embedding
            }
          }
        }
        delete this.sources_re_import_queue[key];
        if (this.sources_re_import_halted) {
          this.debounce_re_import_queue();
          // return; // halt re-importing if halted
        }
      }
      // console.time('process_embed_queue');
      await this.smart_sources?.process_embed_queue();
    }
    // console.timeEnd('process_embed_queue');
    if(this.sources_re_import_timeout) clearTimeout(this.sources_re_import_timeout);
    this.sources_re_import_timeout = null;
    this.refresh_status();
  }

  refresh_status() {
    if (!this.status_elm) {
      this.status_elm = this.main.addStatusBarItem();
      this.smart_view.apply_style_sheet(styles);
      this.status_container = this.status_elm.createEl('a', { cls: 'smart-env-status-container' });
      this.status_container.setAttribute('href', 'https://smartconnections.app/community-supporters/?utm_source=status-bar');
      this.status_container.setAttribute('target', '_external');
      setIcon(this.status_container, 'smart-connections');
      this.status_msg = this.status_container.createSpan('smart-env-status-msg');
    }
    const queue_length = Object.keys(this.sources_re_import_queue || {}).length;
    if (queue_length) {
      this.status_msg.setText(`Embed now (${queue_length})`);
      this.status_container.setAttribute('title', 'Click to re-import.');
      this.status_container.removeEventListener('click', re_embed_click_handler);
      this.status_container.addEventListener('click', re_embed_click_handler);
    }else{
      this.status_msg.setText('Smart Env ' + this.constructor.version);
      this.status_container.setAttribute('title', 'Learn about Community Supporters');
      this.status_container.removeEventListener('click', re_embed_click_handler);
    }
  }

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
    const redirect_uri = encodeURIComponent("obsidian://sc-op/callback");
    const url = `${get_smart_server_url()}/oauth?client_id=smart-plugins-op&redirect_uri=${redirect_uri}&state=${state}`;
    open_url_externally(this.plugin, url);
  }
  /**
   * Handles the OAuth callback from the Smart Plugins server.
   * @param {Object} params - The URL parameters from the OAuth callback.
   */
  async handle_sc_op_oauth_callback(params) {
    const code = params.code;
    if (!code) {
      new Notice("No OAuth code provided in URL. Login failed.");
      return;
    }
    try {
      // your existing OAuth + plugin install logic
      await exchange_code_for_tokens(code, this.plugin);
      await install_smart_plugins_plugin(this.plugin);
      new Notice("Smart Plugins installed / updated successfully!");
      this.open_smart_plugins_settings();
    } catch (err) {
      console.error("OAuth callback error", err);
      new Notice(`OAuth callback error: ${err.message}`);
    }
  }
  /**
   * Opens the Obsidian settings window with the 'Smart Plugins' tab active.
   * @public
   */
  async open_smart_plugins_settings() {
    const spInstalled = this.plugin.app.plugins.plugins['smart-plugins'];
    if(!spInstalled) {
      await install_smart_plugins_plugin(this.plugin);
      await new Promise(r => setTimeout(r, 500));
    }
    // check if Smart Plugins is enabled
    const spEnabled = this.plugin.app.plugins.enabledPlugins.has('smart-plugins');
    if(!spEnabled) {
      await enable_plugin(this.plugin.app, 'smart-plugins');
      await new Promise(r => setTimeout(r, 500));
    }
    // open Obsidian settings
    this.plugin.app.commands.executeCommandById('app:open-settings');
    // find the Smart Plugins tab by name
    const spTab = this.plugin.app.setting.pluginTabs.find(t => t.name === 'Smart Plugins');
    if (spTab) {
      this.plugin.app.setting.openTab(spTab);
    }
  }
}

async function disable_plugin(app, plugin_id) {
  console.log('disabling plugin ' + plugin_id);
  await app.plugins.unloadPlugin(plugin_id);
  await app.plugins.disablePluginAndSave(plugin_id);
  await app.plugins.loadManifests();
}
function re_embed_click_handler (e) {
  e.preventDefault();
  e.stopPropagation();
  smart_env.status_msg.setText(`Embedding...`);
  smart_env.run_re_import();
}