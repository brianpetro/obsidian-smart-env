import { MarkdownRenderer, requestUrl, setIcon } from 'obsidian';
import {
  build_plugin_file_record,
  disable_plugin,
  enable_plugin,
  fetch_plugin_file,
  fetch_server_plugin_list,
  get_oauth_storage_prefix,
  install_file_names,
  normalize_positive_epoch_ms,
  write_files_with_adapter,
} from '../../utils/smart_plugins.js';
import {
  compute_plugin_list_item_state,
  get_install_enable_behavior,
  infer_installed_plugin_type,
  should_block_pro_install,
  should_offer_plugin_update,
  should_signal_outdated_env_compatibility,
} from '../../utils/smart_plugins_state.js';
import styles from './style.css';
import { compare_versions } from 'smart-environment/utils/compare_versions.js';
import { convert_to_time_ago } from 'smart-utils/convert_to_time_ago.js';
import { convert_to_time_until } from 'smart-utils/convert_to_time_until.js';

const SMART_PLUGINS_DESC = `
  <div class="smart-plugins-track-guide-item">
    <a class="smart-plugin-track-badge smart-plugin-core-track-badge" href="https://smartconnections.app/core-plugins/?utm_source=plugin-store-track-guide" target="_external">Core</a>
    <span class="smart-plugins-track-guide-copy">Essential functionality and a &quot;just works&quot; experience.</span>
  </div>
  <div class="smart-plugins-track-guide-item">
    <button type="button" class="smart-plugin-track-badge smart-plugin-pro-badge" data-smart-plugins-pro-badge data-source="plugin-store-track-guide" aria-label="Learn about Pro plugins" title="Learn about Pro plugins">Pro</button>
    <span class="smart-plugins-track-guide-copy">Advanced configuration and features for Obsidian AI experts. <a href="https://smartconnections.app/smart-plugins/?utm_source=plugin-store-track-guide" target="_external">Compare Smart Plugins</a>.</span>
  </div>
`;
const PRO_PLUGINS_URL = 'https://smartconnections.app/pro-plugins/';
const PRO_PLUGINS_FOOTER = `All Pro plugins include advanced configurations and additional model providers. Pro users get priority support via email. <a href="${PRO_PLUGINS_URL}?utm_source=plugin-store" target="_external">Learn more</a> about Pro Plugins.`;

function default_smart_plugins_list() {
  return [
    {
      item_type: 'core',
      install_method: 'obsidian',
      item_name: 'Smart Connections',
      item_desc: 'See notes related to what you are working on right now.',
      item_repo: 'brianpetro/obsidian-smart-connections',
      plugin_id: 'smart-connections',
      icon_name: 'smart-connections',
      url: 'https://smartconnections.app/smart-connections/',
    },
    {
      item_type: 'pro',
      item_name: 'Connections Pro',
      plugin_id: 'smart-connections',
      icon_name: 'smart-connections',
      item_desc: 'More opportunities for connections. Graph view for visualizing. Inline and footer views (great for mobile!). Configurable algorithms and additional embedding model providers.',
      url: 'https://smartconnections.app/smart-connections/',
    },
    {
      item_type: 'core',
      install_method: 'obsidian',
      item_name: 'Smart Context',
      item_desc: 'Assemble notes into AI-ready context with selectors, links, and templates.',
      item_repo: 'brianpetro/smart-context-obsidian',
      plugin_id: 'smart-context',
      icon_name: 'smart-context-builder',
      url: 'https://smartconnections.app/smart-context/',
    },
    {
      item_type: 'pro',
      item_name: 'Context Pro',
      plugin_id: 'smart-context',
      icon_name: 'smart-context-builder',
      item_desc: 'Advanced tools for context engineering. Utilize Bases, images, and external sources (great for coders!) in your contexts.',
      url: 'https://smartconnections.app/smart-context/',
    },
    {
      item_type: 'core',
      install_method: 'obsidian',
      item_name: 'Smart Chat',
      item_desc: 'Run chat workflows in Obsidian with Smart Environment context.',
      plugin_id: 'smart-chatgpt',
      icon_name: 'smart-chat',
      item_repo: 'brianpetro/smart-chatgpt-obsidian',
      url: 'https://smartconnections.app/smart-chat/',
    },
    {
      item_type: 'pro',
      item_name: 'Chat Pro (API)',
      plugin_id: 'smart-chat',
      icon_name: 'smart-chat',
      item_desc: 'Configure chat to use Local and Cloud API providers (Ollama, LM Studio, OpenAI, Gemini, Anthropic, Open Router, and more).',
      url: 'https://smartconnections.app/smart-chat/',
    },
    {
      item_type: 'core',
      item_name: 'Smart Lookup',
      item_desc: 'Run semantic search as a dedicated Smart Plugin.',
      item_repo: 'brianpetro/smart-lookup-obsidian',
      plugin_id: 'smart-lookup',
      icon_name: 'smart-lookup',
      url: 'https://smartconnections.app/smart-lookup/',
      install_method: 'github',
    },
    {
      item_type: 'core',
      install_method: 'obsidian',
      item_name: 'Smart Templates',
      item_repo: 'brianpetro/obsidian-smart-templates',
      plugin_id: 'smart-templates',
      icon_name: 'layout-template',
      item_desc: 'Create structured templates designed for Smart Plugins workflows.',
      url: 'https://smartconnections.app/smart-templates/',
    },
    {
      item_type: 'pro',
      item_name: 'Connect Pro',
      plugin_id: 'smart-connect-pro',
      icon_name: 'link',
      item_desc: 'Integrate with ChatGPT. Use a GPT that has access to Obsidian CLI.',
      url: 'https://smartconnections.app/connect-pro/',
    },
  ];
}
let SMART_PLUGINS_LIST = default_smart_plugins_list();

export function build_html(env, params = {}) {
  return `
    <div class="pro-plugins-container">
      <div class="setting-group smart-plugins-store">
        <div class="smart-plugins-login"></div>
        <div class="smart-plugins-intro" role="group" aria-label="Smart Plugin tracks">${SMART_PLUGINS_DESC}</div>
        <div class="smart-plugins-server-message callout" data-callout="note" style="display:none;">
          <div class="callout-title">
            <div class="callout-icon"></div>
            <div class="callout-title-inner">Store message</div>
          </div>
          <div class="callout-content markdown-rendered"></div>
        </div>
        <div class="smart-plugins-section">
          <div class="smart-plugins-official-list">Loading...</div>
        </div>
        <div class="smart-plugins-section smart-plugins-experimental-section" style="display:none;">
          <div class="smart-plugins-section-title">Experimental</div>
          <div class="smart-plugins-section-description">
            Available to Pro subscribers. These plugins may change quickly.
          </div>
          <div class="smart-plugins-experimental-list"></div>
        </div>
        <div class="smart-plugins-marketing-section">
          <div class="smart-plugins-marketing-title">More from Smart Plugins</div>
          <p class="smart-plugins-footer">${PRO_PLUGINS_FOOTER}</p>
          <div class="smart-plugins-referral"></div>
        </div>
      </div>
    </div>
  `;
}

export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const html = build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}

export async function post_process(env, container, params = {}) {
  const plugin = env.plugin || null;
  const app = plugin?.app || window.app;
  const oauth_storage_prefix = get_oauth_storage_prefix(app);

  const login_container = container.querySelector('.smart-plugins-login');
  const referral_container = container.querySelector('.smart-plugins-referral');
  const official_list_el = container.querySelector('.smart-plugins-official-list');
  const experimental_section_el = container.querySelector('.smart-plugins-experimental-section');
  const experimental_list_el = container.querySelector('.smart-plugins-experimental-list');
  const server_message_el = container.querySelector('.smart-plugins-server-message');
  const server_message_icon_el = server_message_el?.querySelector('.callout-icon');
  const server_message_title_el = server_message_el?.querySelector('.callout-title-inner');
  const server_message_content_el = server_message_el?.querySelector('.callout-content');

  const handle_pro_badge_click = (event) => {
    const badge = event.target?.closest?.('[data-smart-plugins-pro-badge]');
    if (!badge || !container.contains(badge)) return;

    const source = badge.getAttribute('data-source');
    window.open(build_pro_plugins_url(source), '_external');
  };
  container.addEventListener('click', handle_pro_badge_click);

  const render_component = env.smart_components.render_component.bind(env.smart_components);
  const render_login = async (login_params = {}) => {
    const login_el = await render_component('smart_plugins_login', env, {
      ...params,
      ...login_params,
    });
    this.empty(login_container);
    if (login_el) login_container.appendChild(login_el);
  };
  const render_referrals = async (referral_params = {}) => {
    const referral_el = await render_component('smart_plugins_referral', env, {
      ...params,
      ...referral_params,
    });
    this.empty(referral_container);
    if (referral_el) referral_container.appendChild(referral_el);
  };
  const render_markdown = async (target_el, markdown = '') => {
    if (!target_el) return;

    this.empty(target_el);
    const safe_markdown = String(markdown || '').trim();
    if (!safe_markdown) return;

    await MarkdownRenderer.render(app, safe_markdown, target_el, '', plugin);
    target_el.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_external');
    });
  };
  const render_server_message = async (message = '', opts = {}) => {
    const safe_message = String(message || '').trim();
    if (!safe_message) {
      if (server_message_el?.style) server_message_el.style.display = 'none';
      if (server_message_content_el) this.empty(server_message_content_el);
      return;
    }

    const safe_title = String(opts.title || 'Store message').trim() || 'Store message';
    const callout_type = String(opts.callout_type || 'note').trim() || 'note';

    if (server_message_el?.style) server_message_el.style.display = '';
    server_message_el?.setAttribute?.('data-callout', callout_type);
    if (server_message_title_el) server_message_title_el.textContent = safe_title;
    if (server_message_content_el) await render_markdown(server_message_content_el, safe_message);
    if (server_message_icon_el) {
      setIcon(server_message_icon_el, callout_type === 'warning' ? 'alert-triangle' : 'info');
    }
  };
  const render_plugin_items = async (list_container, plugin_items = []) => {
    this.empty(list_container);

    for (const item of plugin_items) {
      const row = await render_component('smart_plugins_list_item', item, {
        ...params,
        app,
        env,
        token: item.auth_token,
        sub_exp: item.root_sub_exp,
      });
      if (!row) continue;

      if (item.has_group_ui) {
        list_container.appendChild(row);
        continue;
      }

      const group_frag = this.create_doc_fragment('<div class="setting-group smart-plugins-item-group"><div class="setting-items"></div></div>');
      const group_el = group_frag.firstElementChild;
      const group_items_el = group_el.querySelector('.setting-items');
      group_items_el.appendChild(row);
      list_container.appendChild(group_el);
    }
  };

  let viewed_event_emitted = false;
  let handled_token_rejection = false;
  const render_smart_plugins = async () => {
    const token = localStorage.getItem(oauth_storage_prefix + 'token') || '';
    const has_token = Boolean(token);

    if (!viewed_event_emitted) {
      viewed_event_emitted = true;
      emit_store_event(env, 'pro_plugins:viewed', params, {
        event_source: 'smart_plugins_list',
        recommended_track: 'pro',
      });
    }

    await render_login({
      auth_state: has_token ? 'checking' : 'signed_out',
      sub_exp: null,
    });
    this.empty(referral_container);
    await render_server_message();
    experimental_section_el.style.display = 'none';
    this.empty(experimental_list_el);

    try {
      let resp = await fetch_server_plugin_list(token);
      let auth_state = has_token ? 'signed_in' : 'signed_out';
      let server_message = String(resp?.message || '').trim();

      if (resp?.status === 401 && has_token) {
        auth_state = 'invalid';

        if (!handled_token_rejection) {
          handled_token_rejection = true;
          emit_store_event(env, 'pro_plugins:oauth_token_rejected', params, {
            level: 'warning',
            message: 'Session expired. Please log in again.',
            event_source: 'smart_plugins_list',
            recommended_track: 'pro',
          });
        }

        server_message = build_invalid_credentials_message(server_message);

        const guest_resp = await fetch_server_plugin_list('');
        if (guest_resp?.status === 200) {
          resp = {
            ...guest_resp,
            status: resp.status,
          };
        } else {
          resp = {
            list: [],
            sub_exp: null,
            status: resp.status,
          };
        }
      } else {
        handled_token_rejection = false;
      }

      if (resp?.status && ![200, 401].includes(resp.status)) {
        throw new Error(`plugin_list error ${resp.status}: ${resp?.message || 'Unknown error'}`);
      }

      const sub_exp = resp?.sub_exp ?? null;

      await render_login({
        auth_state,
        sub_exp,
      });
      await render_referrals({
        token: auth_state === 'signed_in' ? token : '',
        sub_exp,
        auth_state,
      });
      await render_server_message(server_message, {
        callout_type: auth_state === 'invalid' ? 'warning' : 'note',
        title: auth_state === 'invalid' ? 'Account message' : 'Store message',
      });

      SMART_PLUGINS_LIST = await hydrate_plugins_list(resp, env, {
        root_sub_exp: sub_exp,
      });

      const {
        official_items,
        experimental_items,
      } = partition_plugin_items(SMART_PLUGINS_LIST);

      await render_plugin_items(official_list_el, official_items);

      if (experimental_items.length) {
        experimental_section_el.style.display = '';
        await render_plugin_items(experimental_list_el, experimental_items);
      } else {
        experimental_section_el.style.display = 'none';
        this.empty(experimental_list_el);
      }

    } catch (err) {
      console.error('[smart-plugins:list] Failed to fetch plugin list:', err);
      this.empty(official_list_el);
      this.empty(experimental_list_el);
      experimental_section_el.style.display = 'none';
      await render_server_message();
      official_list_el.appendChild(this.create_doc_fragment('<div class="error"><p>Failed to load plugin information.</p><button class="retry">Retry</button></div>'));
      SMART_PLUGINS_LIST = default_smart_plugins_list();
      const retry_button = official_list_el.querySelector('.retry');
      if (retry_button) {
        retry_button.addEventListener('click', render_smart_plugins);
      }
    }
  };

  const disposers = [];
  disposers.push(() => container.removeEventListener('click', handle_pro_badge_click));
  disposers.push(env.events.on('smart_plugins_oauth_completed', render_smart_plugins));
  disposers.push(env.events.on('pro_plugins:logged_out', render_smart_plugins));
  disposers.push(env.events.on('smart_plugins:store_refresh', render_smart_plugins));
  // DEPRECATED: retain as a read-only Store refresh alias during migration.
  disposers.push(env.events.on('pro_plugins:refresh', render_smart_plugins));
  this.attach_disposer?.(container, disposers);

  await render_smart_plugins();
  return container;
}

function build_pro_plugins_url(source = '') {
  const safe_source = String(source || '').trim() || 'plugin-store-pro-badge';
  return `${PRO_PLUGINS_URL}?utm_source=${encodeURIComponent(safe_source)}`;
}

function normalize_release_version(value) {
  const normalized_value = String(value || '').trim();
  if (!normalized_value) {
    return '';
  }
  return normalized_value.replace(/^v/i, '');
}

function get_source_surface(params = {}) {
  const source_surface = String(
    params.source_surface ||
    params.event_source ||
    'plugin_store'
  ).trim();
  return source_surface || 'plugin_store';
}

function build_store_event_payload(params = {}, extra = {}) {
  return {
    plugin_key: null,
    feature_key: null,
    source_surface: get_source_surface(params),
    recommended_track: null,
    ...extra,
  };
}

function emit_store_event(env, event_key, params = {}, extra = {}) {
  env?.events?.emit?.(event_key, build_store_event_payload(params, extra));
}

async function hydrate_plugins_list(server_resp, env, params = {}) {
  const smart_plugins_list = default_smart_plugins_list();

  const { list = [] } = server_resp || {};

  for (const server_item of list) {
    const server_item_type = get_plugin_item_type(server_item) || 'pro';
    const local_item = smart_plugins_list.find((item) => {
      return item.plugin_id === server_item.plugin_id
        && get_plugin_item_type(item) === server_item_type
      ;
    });

    if (!local_item) {
      smart_plugins_list.push({
        item_type: server_item_type,
        ...server_item,
      });
      continue;
    }

    Object.assign(local_item, server_item, {
      item_type: server_item_type,
    });
  }

  await hydrate_core_plugin_versions(smart_plugins_list);

  return build_plugin_list_items(smart_plugins_list, env, params);
}

async function hydrate_core_plugin_versions(smart_plugins_list = []) {
  for (const item of smart_plugins_list) {
    if (get_plugin_item_type(item) !== 'core') continue;

    const repo = get_plugin_repo(item);
    if (!repo) continue;

    try {
      const { json: release } = await requestUrl({
        url: `https://api.github.com/repos/${repo}/releases/latest`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        contentType: 'application/json',
      });
      const version = normalize_release_version(
        release?.tag_name ||
        release?.name ||
        item?.version ||
        ''
      );
      if (version) {
        item.version = version;
      }
      const last_updated = Date.parse(
        release?.published_at ||
        release?.created_at ||
        release?.updated_at ||
        ''
      );
      if (Number.isFinite(last_updated) && last_updated > 0) {
        item.last_updated = last_updated;
      }
    } catch (error) {
      console.warn(`[smart-plugins:list] Failed to hydrate latest core release for ${repo}`, error);
    }
  }
}

function build_plugin_list_items(smart_plugins_list = [], env, params = {}) {
  const plugin_map = new Map();

  for (const plugin of smart_plugins_list) {
    const group_key = get_plugin_group_key(plugin);
    if (!plugin_map.has(group_key)) {
      plugin_map.set(group_key, { core: null, pro: null });
    }

    const plugin_group = plugin_map.get(group_key);
    if (get_plugin_item_type(plugin) === 'core') {
      plugin_group.core = plugin;
    } else {
      plugin_group.pro = plugin;
    }
  }

  return Array.from(plugin_map.values()).map((plugin_group) => {
    return new PluginListItem(env, plugin_group, params);
  });
}

export class PluginListItem {
  constructor(env, plugins = {}, params = {}) {
    this.env = env;
    this.app = env.obsidian_app;
    this.core_plugin = plugins.core || null;
    this.pro_plugin = plugins.pro || null;
    this.root_sub_exp = normalize_positive_epoch_ms(params.root_sub_exp);
  }

  get auth_token() {
    const oauth_storage_prefix = get_oauth_storage_prefix(this.app);
    return localStorage.getItem(oauth_storage_prefix + 'token') || '';
  }

  get plugin_id() {
    return String(
      this.core_plugin?.plugin_id ||
      this.pro_plugin?.plugin_id ||
      ''
    ).trim();
  }

  get has_core_plugin() {
    return Boolean(this.core_plugin);
  }

  get has_pro_plugin() {
    return Boolean(this.pro_plugin);
  }

  get has_group_ui() {
    return this.has_core_plugin && this.has_pro_plugin;
  }

  get display_item_type() {
    if (this.has_group_ui) return 'group';
    return get_plugin_item_type(this.primary_plugin) || 'pro';
  }

  get primary_plugin() {
    return this.core_plugin || this.pro_plugin || null;
  }

  get installed_manifest() {
    return this.app.plugins?.manifests?.[this.plugin_id] || null;
  }

  get pending_install() {
    return this.env?.pending_plugin_installs?.[this.plugin_id] || null;
  }

  get pending_disable() {
    return this.env?.pending_plugin_disables?.[this.plugin_id] === true;
  }

  get is_enabled() {
    return this.app.plugins.enabledPlugins.has(this.plugin_id);
  }

  get env_plugin_state() {
    return this.env?.plugin_states?.[this.plugin_id] || null;
  }

  get installed_type() {
    const pending_item_type = get_plugin_item_type(this.pending_install);
    if (pending_item_type === 'core' || pending_item_type === 'pro') {
      return pending_item_type;
    }

    if (!this.installed_manifest) return null;

    if (this.has_pro_plugin && !this.has_core_plugin) {
      return 'pro';
    }

    if (this.has_core_plugin && !this.has_pro_plugin) {
      return 'core';
    }

    return infer_installed_plugin_type({
      plugin_id: this.plugin_id,
      manifest_name: this.installed_manifest.name,
    });
  }

  get installed_plugin() {
    return this.get_track_plugin(this.installed_type);
  }

  get loaded_version() {
    return this.app.plugins.plugins[this.plugin_id]?.manifest?.version || null;
  }

  get loaded_env_version() {
    return this.app.plugins.plugins[this.plugin_id]?.SmartEnv?.version || '';
  }

  get installed_version() {
    return normalize_release_version(this.pending_install?.version)
      || this.installed_manifest?.version
      || null
    ;
  }

  get is_entitled() {
    return this.pro_plugin?.entitled === true;
  }

  get tags() {
    return [...new Set([
      ...get_plugin_tags(this.core_plugin),
      ...get_plugin_tags(this.pro_plugin),
    ])];
  }

  get is_experimental() {
    return this.tags.includes('experimental');
  }

  get canonical_url() {
    if (!this.has_group_ui) {
      return this.get_track_canonical_url(this.display_item_type);
    }

    return this.get_track_canonical_url(this.installed_type || 'pro')
      || this.get_track_canonical_url('core')
      || ''
    ;
  }

  get details_url() {
    if (!this.has_group_ui) {
      return this.get_track_details_url(this.display_item_type);
    }

    return this.get_track_details_url(this.installed_type || 'pro')
      || this.get_track_details_url('core')
      || ''
    ;
  }

  get item_sub_exp() {
    return normalize_positive_epoch_ms(this.pro_plugin?.sub_exp);
  }

  get should_show_item_subscription_state() {
    return this.has_pro_plugin
      && this.root_sub_exp === null
      && this.item_sub_exp !== null
    ;
  }

  get subscription_status_text() {
    if (!this.should_show_item_subscription_state) {
      return '';
    }

    if (this.item_sub_exp < Date.now()) {
      return `Subscription expired ${convert_to_time_ago(this.item_sub_exp)}.`;
    }

    return `Subscription active, renews ${convert_to_time_until(this.item_sub_exp)}.`;
  }

  get formatted_name() {
    if (this.has_group_ui) {
      return format_plugin_name(get_plugin_name(this.core_plugin))
        || format_plugin_name(get_plugin_name(this.pro_plugin))
        || this.plugin_id
      ;
    }

    return format_plugin_name(get_plugin_name(this.primary_plugin))
      || this.plugin_id
    ;
  }

  get label() {
    return get_plugin_label(this.primary_plugin) || this.plugin_id || 'plugin';
  }

  get formatted_description() {
    return get_plugin_description(this.primary_plugin);
  }

  get is_loaded() {
    if (!this.installed_type) return false;
    return this.is_enabled && this.env_plugin_state === 'loaded';
  }

  get is_deferred() {
    if (!this.installed_type) return false;
    return this.is_enabled && (
      this.env_plugin_state === 'deferred'
      || (
        this.loaded_version
        && this.installed_version
        && this.loaded_version !== this.installed_version
      )
    );
  }

  get should_update() {
    const installed_type = this.installed_type;
    if (!installed_type) return false;

    const installed_plugin = this.get_track_plugin(installed_type);
    return should_offer_plugin_update({
      item_type: installed_type,
      installed_type,
      is_entitled: installed_type === 'pro' ? this.is_entitled : true,
      server_version: normalize_release_version(installed_plugin?.version),
      installed_version: this.installed_version,
      compare_versions,
    });
  }

  get has_outdated_env_compatibility() {
    const installed_type = this.installed_type;
    if (!installed_type) return false;

    return should_signal_outdated_env_compatibility({
      item_type: installed_type,
      installed_type,
      is_entitled: installed_type === 'pro' ? this.is_entitled : true,
      is_enabled: this.is_enabled,
      is_loaded: this.is_loaded,
      is_deferred: this.is_deferred,
      loaded_env_version: this.loaded_env_version,
    });
  }

  get is_installed() {
    return Boolean(this.installed_type);
  }

  get computed_state() {
    const computed_state = compute_plugin_list_item_state({
      has_core_plugin: this.has_core_plugin,
      has_pro_plugin: this.has_pro_plugin,
      display_item_type: this.display_item_type,
      installed_type: this.installed_type,
      is_entitled: this.is_entitled,
      should_update: this.pending_disable ? false : this.should_update,
      has_outdated_env_compatibility: this.pending_disable
        ? false
        : this.has_outdated_env_compatibility,
      is_deferred: this.is_deferred || this.pending_disable,
      is_loaded: this.pending_disable ? false : this.is_loaded,
      is_enabled: this.is_enabled || this.pending_disable,
    });

    const hydrate_track_state = (track_state) => {
      if (!track_state) return null;

      return {
        ...track_state,
        plugin: this.get_track_plugin(track_state.item_type),
        control_specs: this.get_control_specs_for_state(track_state.control_state, track_state.item_type),
      };
    };

    return {
      row: hydrate_track_state(computed_state.row),
      track_states: {
        core: hydrate_track_state(computed_state.track_states.core),
        pro: hydrate_track_state(computed_state.track_states.pro),
      },
    };
  }

  get control_specs() {
    return this.computed_state.row?.control_specs || [];
  }

  get_track_state(item_type) {
    return this.computed_state.track_states?.[item_type] || null;
  }

  get_control_specs_for_state(control_state, item_type = this.installed_type) {
    const toggle_value = this.installed_type === item_type && this.is_enabled;
    const track_version = normalize_release_version(
      this.get_track_plugin(item_type)?.version,
    );
    const installed_version = normalize_release_version(this.installed_version);
    const enabled_toggle = {
      type: 'toggle',
      item_type,
      value: toggle_value,
      text: 'Enabled',
    };
    const installed_status_text = this.is_loaded
      ? 'Active'
      : this.is_enabled
        ? 'Enabled'
        : 'Installed'
    ;

    switch (control_state) {
      case 'deferred': {
        let reload_text = installed_version && installed_version !== 'unknown'
          ? `Reload required to activate v${installed_version}`
          : 'Reload required to activate'
        ;
        if (this.pending_disable) reload_text = 'Reload required to disable';
        return [
          { type: 'button', action: 'restart_obsidian', text: reload_text, variant: 'primary' },
          enabled_toggle,
        ];
      }
      case 'update_available':
        return [
          { type: 'status', text: installed_status_text },
          {
            type: 'button',
            action: 'install',
            text: track_version && track_version !== 'unknown'
              ? `Update to v${track_version}`
              : 'Update',
            variant: 'primary',
          },
          enabled_toggle,
        ];
      case 'outdated_env':
        return [
          {
            type: 'button',
            action: 'restart_obsidian',
            text: 'Reload required for Smart Environment',
            variant: 'primary',
          },
          enabled_toggle,
        ];
      case 'loaded':
        return [
          { type: 'status', text: 'Active' },
          { type: 'button', action: 'open_settings', text: 'Open settings', variant: 'secondary' },
          enabled_toggle,
        ];
      case 'installed':
        return [
          { type: 'status', text: 'Enabled' },
          enabled_toggle,
        ];
      case 'can_enable':
        return [
          { type: 'status', text: 'Installed' },
          { type: 'toggle', item_type, value: false, text: 'Enable' },
        ];
      case 'included_in_pro':
        return [
          { type: 'status', text: 'Included in Pro' },
        ];
      case 'core_installed':
        return this.is_entitled
          ? [
            { type: 'status', text: 'Core installed' },
            { type: 'toggle', item_type, value: false, text: 'Install Pro' },
          ]
          : [
            { type: 'status', text: 'Requires Pro' },
            { type: 'toggle', item_type, value: false, text: 'Install Pro', disabled: true },
          ]
        ;
      case 'can_install_core_only':
        return [
          { type: 'toggle', item_type, value: false, text: 'Install Core' },
        ];
      case 'can_install_pro':
        return [
          { type: 'toggle', item_type, value: false, text: 'Install Pro' },
        ];
      case 'cant_install':
        return [
          { type: 'status', text: 'Requires Pro' },
          { type: 'toggle', item_type, value: false, text: 'Install Pro', disabled: true },
        ];
      case 'can_install':
      default:
        return [
          { type: 'toggle', item_type, value: false, text: 'Install' },
        ];
    }
  }

  get_track_control_specs(item_type) {
    return this.get_track_state(item_type)?.control_specs || [];
  }

  get_busy_text(action) {
    const control_state = this.computed_state.row?.control_state || '';

    switch (action) {
      case 'install':
        return ['update_available', 'outdated_env'].includes(control_state)
          ? 'Updating…'
          : 'Installing…'
        ;
      case 'enable':
        return 'Enabling…';
      default:
        return '';
    }
  }

  get_busy_text_for_track(item_type, action) {
    const control_state = this.get_track_state(item_type)?.control_state || '';

    switch (action) {
      case 'install':
        return ['update_available', 'outdated_env'].includes(control_state)
          ? 'Updating…'
          : 'Installing…'
        ;
      case 'enable':
        return 'Enabling…';
      default:
        return this.get_busy_text(action);
    }
  }

  get install_target_plugin() {
    const control_state = this.computed_state.row?.control_state || 'can_install';

    if (['update_available', 'outdated_env'].includes(control_state)) {
      return this.installed_plugin;
    }

    if (control_state === 'can_install_pro' || control_state === 'core_installed') {
      return this.pro_plugin;
    }

    if (control_state === 'can_install_core_only') {
      return this.core_plugin;
    }

    if (control_state === 'can_install') {
      return this.core_plugin || this.pro_plugin;
    }

    return this.installed_plugin || this.core_plugin || this.pro_plugin;
  }

  get install_target_item_type() {
    return get_plugin_item_type(this.install_target_plugin);
  }

  get install_target_label() {
    return get_plugin_label(this.install_target_plugin)
      || this.label
      || this.plugin_id
      || 'plugin'
    ;
  }

  get_track_plugin(item_type) {
    if (item_type === 'core') return this.core_plugin;
    if (item_type === 'pro') return this.pro_plugin;
    return null;
  }

  get_track_name(item_type) {
    return format_plugin_name(get_plugin_name(this.get_track_plugin(item_type)))
      || this.formatted_name
      || this.plugin_id
    ;
  }

  get_track_description(item_type) {
    return get_plugin_description(this.get_track_plugin(item_type));
  }

  get_track_icon_name(item_type) {
    return get_plugin_icon_name(this.get_track_plugin(item_type));
  }

  get_track_meta_text(item_type) {
    const plugin = this.get_track_plugin(item_type);
    const meta = [];
    const version = normalize_release_version(plugin?.version);
    const current_version = this.installed_type === item_type
      ? normalize_release_version(this.loaded_version || this.installed_manifest?.version)
      : ''
    ;
    const last_updated = normalize_positive_epoch_ms(plugin?.last_updated);

    if (version && version !== 'unknown') {
      const version_difference = current_version
        ? compare_versions(version, current_version)
        : 0
      ;

      if (current_version && version_difference !== 0) {
        meta.push(`Current v${current_version}`);
        meta.push(`${version_difference > 0 ? 'Available' : 'Store'} v${version}`);
      } else {
        meta.push(`v${version}`);
      }
    }
    if (last_updated) {
      meta.push(`Updated ${convert_to_time_ago(last_updated)}`);
    }

    return meta.join(' - ');
  }

  get_track_link_items(item_type) {
    const plugin = this.get_track_plugin(item_type) || this.primary_plugin;
    const links = [];
    const seen_urls = new Set();
    const add_link = (title, icon, url) => {
      const safe_url = String(url || '').trim();
      if (!safe_url || seen_urls.has(safe_url)) return;
      seen_urls.add(safe_url);
      links.push({ title, icon, url: safe_url });
    };
    const main_url = get_plugin_main_url(plugin);
    const plugin_id = String(plugin?.plugin_id || '').trim();
    const release_page_url = this.installed_type === item_type
      ? build_plugin_release_page_url(plugin, this.installed_version)
      : ''
    ;

    add_link('Release notes', 'file-text', release_page_url);
    add_link('Getting started', 'rocket', build_getting_started_url(main_url));
    if (item_type === 'core' && plugin_id) {
      add_link(
        'Obsidian plugin listing',
        'obsidian',
        `https://community.obsidian.md/plugins/${encodeURIComponent(plugin_id)}`,
      );
    }
    add_link('Details', 'info', plugin?.details_url);
    add_link('Documentation', 'book-open', plugin?.docs_url);
    add_link('Learn more', 'help-circle', plugin?.info_url);
    if (item_type !== 'core') {
      add_link('Plugin page', 'external-link', main_url);
    }

    return links;
  }

  get_track_canonical_url(item_type) {
    const plugin = this.get_track_plugin(item_type) || this.primary_plugin;
    return get_plugin_canonical_url(plugin)
      || get_plugin_details_url(plugin)
      || PRO_PLUGINS_URL
    ;
  }

  get_track_details_url(item_type) {
    const plugin = this.get_track_plugin(item_type) || this.primary_plugin;
    const release_page_url = this.installed_type === item_type
      ? build_plugin_release_page_url(plugin, this.installed_version)
      : ''
    ;

    return release_page_url
      || get_plugin_details_url(plugin)
      || get_plugin_canonical_url(plugin)
      || ''
    ;
  }

  get_track_subscription_status_text(item_type) {
    if (item_type !== 'pro') return '';
    return this.subscription_status_text;
  }

  get_plugin_action_label(plugin) {
    return get_plugin_label(plugin)
      || this.install_target_label
      || this.label
      || this.plugin_id
      || 'plugin'
    ;
  }

  mark_install_deferred(plugin, version = plugin?.version) {
    if (!this.env.pending_plugin_installs) {
      this.env.pending_plugin_installs = {};
    }
    this.env.pending_plugin_installs[this.plugin_id] = {
      item_type: get_plugin_item_type(plugin),
      version: normalize_release_version(version),
    };
    this.env.plugin_states[this.plugin_id] = 'deferred';
  }

  mark_disable_deferred() {
    if (!this.env.pending_plugin_disables) {
      this.env.pending_plugin_disables = {};
    }
    this.env.pending_plugin_disables[this.plugin_id] = true;
  }

  clear_pending_disable() {
    if (!this.env.pending_plugin_disables) return;
    delete this.env.pending_plugin_disables[this.plugin_id];
  }

  async handle_toggle(item_type, should_enable, params = {}) {
    if (should_enable) {
      if (this.installed_type === item_type) {
        return await this.enable(params);
      }
      await this.handle_track_action(item_type, 'install', params);
      return this.installed_type === item_type && this.is_enabled;
    }

    if (this.installed_type !== item_type) return false;
    return await this.disable(item_type);
  }

  async handle_action(action, params = {}) {
    switch (action) {
      case 'install':
        if (should_block_pro_install({
          item_type: this.install_target_item_type,
          is_entitled: this.is_entitled,
        })) {
          emit_store_event(this.env, 'pro_plugins:install_blocked', params, {
            plugin_key: this.plugin_id,
            recommended_track: 'pro',
            level: 'warning',
            message: `${this.install_target_label} requires an active Pro entitlement.`,
            event_source: 'browse_smart_plugins.list_item.install',
          });
          return;
        }
        await this.install(params);
        return;
      case 'enable':
        await this.enable(params);
        return;
      case 'restart_obsidian':
        this.restart_obsidian();
        return;
      case 'open_settings':
        this.open_settings();
        return;
      case 'learn_more':
        this.open_plugin_url(params);
        return;
      case 'open_details':
        this.open_details_url();
        return;
      default:
        return;
    }
  }

  async handle_track_action(item_type, action, params = {}) {
    if (action === 'install') {
      const plugin = this.get_track_plugin(item_type);
      const track_item_type = get_plugin_item_type(plugin);
      const track_label = get_plugin_label(plugin) || this.install_target_label || this.label;

      if (should_block_pro_install({
        item_type: track_item_type,
        is_entitled: this.is_entitled,
      })) {
        emit_store_event(this.env, 'pro_plugins:install_blocked', params, {
          plugin_key: this.plugin_id,
          recommended_track: 'pro',
          level: 'warning',
          message: `${track_label} requires an active Pro entitlement.`,
          event_source: 'browse_smart_plugins.list_item.install',
        });
        return;
      }

      await this.install(params, plugin);
      return;
    }

    if (action === 'open_details') {
      this.open_track_details_url(item_type);
      return;
    }

    if (action === 'learn_more') {
      this.open_track_plugin_url(item_type, params);
      return;
    }

    await this.handle_action(action, params);
  }

  async install(params = {}, plugin = this.install_target_plugin) {
    if (!plugin) return;

    if (get_plugin_item_type(plugin) === 'core') {
      if (get_plugin_install_method(plugin) === 'github') {
        await this.install_github_release_plugin(params, plugin);
        return;
      }

      await this.install_core_plugin(plugin);
      return;
    }

    emit_store_event(this.env, 'pro_plugin_install_clicked', params, {
      plugin_key: this.plugin_id,
      recommended_track: 'pro',
      event_source: 'browse_smart_plugins.list_item.install',
    });
    await this.install_plugin(params, plugin);
  }

  async enable(params = {}) {
    try {
      const loaded_plugin = this.app.plugins.plugins[this.plugin_id];
      if (this.pending_disable && loaded_plugin) {
        this.app.plugins.enabledPlugins.add(this.plugin_id);
        this.app.plugins.requestSaveConfig();
      } else {
        await enable_plugin(this.app, this.plugin_id);
      }
      this.clear_pending_disable();
      this.env?.events?.emit?.('pro_plugins:enabled', {
        level: 'debug',
        message: `${this.label} enabled.`,
        event_source: 'browse_smart_plugins.list_item',
      });
      this.env?.events?.emit?.('smart_plugins:store_refresh', {
        event_source: 'browse_smart_plugins.list_item.enable',
      });
      return true;
    } catch (err) {
      console.error('[smart-plugins:list] Enable error:', err);
      this.env?.events?.emit?.('pro_plugins:enable_failed', {
        level: 'error',
        message: `Enable failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item',
      });
      return false;
    }
  }

  async disable(item_type = this.installed_type) {
    const plugin = this.get_track_plugin(item_type) || this.installed_plugin;
    const plugin_label = this.get_plugin_action_label(plugin);

    try {
      await disable_plugin(this.app, this.plugin_id);
      this.mark_disable_deferred();
      this.env?.events?.emit?.('smart_plugins:disable_completed', {
        level: 'attention',
        message: `${plugin_label} will be disabled after reloading Obsidian.`,
        btn_text: 'Reload Obsidian',
        btn_callback: 'app:reload',
        event_source: 'browse_smart_plugins.list_item.disable',
      });
      this.env?.events?.emit?.('smart_plugins:store_refresh', {
        event_source: 'browse_smart_plugins.list_item.disable',
      });
      return true;
    } catch (err) {
      console.error('[smart-plugins:list] Disable error:', err);
      this.env?.events?.emit?.('smart_plugins:disable_failed', {
        level: 'error',
        message: `Disable failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item.disable',
      });
      return false;
    }
  }

  restart_obsidian() {
    if (typeof this.app?.commands?.executeCommandById === 'function') {
      this.app.commands.executeCommandById('app:reload');
      return;
    }
    window.location.reload();
  }

  open_settings() {
    this.app.setting.open();
    this.app.setting.openTabById(this.plugin_id);
  }

  open_details_url() {
    const details_url = this.details_url || PRO_PLUGINS_URL;
    window.open(with_utm_source(details_url, 'plugin-store'), '_external');
  }

  open_track_details_url(item_type) {
    const details_url = this.get_track_details_url(item_type) || PRO_PLUGINS_URL;
    window.open(with_utm_source(details_url, 'plugin-store'), '_external');
  }

  open_plugin_url(params = {}) {
    if (this.has_pro_plugin && !this.is_entitled) {
      emit_store_event(this.env, 'pro_trial_cta_clicked', params, {
        plugin_key: this.plugin_id,
        recommended_track: 'pro',
        event_source: 'browse_smart_plugins.list_item.learn_more',
      });
    }
    const url = this.canonical_url || PRO_PLUGINS_URL;
    window.open(with_utm_source(url, 'plugin-store'), '_external');
  }

  open_track_plugin_url(item_type, params = {}) {
    if (item_type === 'pro' && this.has_pro_plugin && !this.is_entitled) {
      emit_store_event(this.env, 'pro_trial_cta_clicked', params, {
        plugin_key: this.plugin_id,
        recommended_track: 'pro',
        event_source: 'browse_smart_plugins.list_item.learn_more',
      });
    }
    const url = this.get_track_canonical_url(item_type) || PRO_PLUGINS_URL;
    window.open(with_utm_source(url, 'plugin-store'), '_external');
  }

  open_track_link_url(item_type, url, params = {}) {
    if (item_type === 'pro' && this.has_pro_plugin && !this.is_entitled) {
      emit_store_event(this.env, 'pro_trial_cta_clicked', params, {
        plugin_key: this.plugin_id,
        recommended_track: 'pro',
        event_source: 'browse_smart_plugins.list_item.menu',
      });
    }
    window.open(with_utm_source(url, 'plugin-store-menu'), '_external');
  }

  async install_core_plugin(plugin) {
    const was_installed = this.is_installed;
    const plugin_label = this.get_plugin_action_label(plugin);
    const install_enable_behavior = get_install_enable_behavior({
      was_installed,
    });

    try {
      this.env?.events?.emit?.('smart_plugins:install_started', {
        level: 'debug',
        message: `Installing "${plugin_label}" ...`,
        event_source: 'browse_smart_plugins.list_item',
      });

      const { json: release } = await this.get_latest_github_release(plugin);
      const version = release?.tag_name;
      await this.app.plugins.installPlugin(get_plugin_repo(plugin), version, {
        id: this.plugin_id,
        name: plugin_label,
      });
      if (install_enable_behavior.should_enable_after_install) {
        await this.enable();
      }
      this.env?.events?.emit?.('smart_plugins:install_completed', {
        level: 'debug',
        message: `${plugin_label} installed successfully.`,
        event_source: 'browse_smart_plugins.list_item',
      });
      this.env?.events?.emit?.('smart_plugins:store_refresh', {
        event_source: 'browse_smart_plugins.list_item.core_install',
      });
    } catch (err) {
      console.error('[smart-plugins:list] Core install error:', err);
      this.env?.events?.emit?.('smart_plugins:install_failed', {
        level: 'error',
        message: `Install failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item',
      });
    }
  }

  async download_plugin_files(plugin) {
    if (!this.auth_token) {
      throw new Error('Login required to install this plugin.');
    }

    const version = String(plugin?.version || '').trim() || null;
    const repo = get_plugin_repo(plugin);
    const files = [];

    for (const file_name of install_file_names) {
      const response = await fetch_plugin_file(repo, this.auth_token, {
        file: file_name,
        version,
      });
      files.push(build_plugin_file_record(file_name, response));
    }

    return files;
  }

  async install_plugin(params = {}, plugin) {
    const was_installed = this.is_installed;
    const was_enabled = this.is_enabled;
    const should_defer_activation = was_installed && was_enabled;
    const plugin_label = this.get_plugin_action_label(plugin);
    const install_enable_behavior = get_install_enable_behavior({
      was_installed,
    });

    try {
      this.env?.events?.emit?.('pro_plugins:install_started', {
        level: 'debug',
        message: `Installing "${plugin_label}" ...`,
        event_source: 'browse_smart_plugins.list_item',
      });

      const files = await this.download_plugin_files(plugin);
      const folder_name = String(this.plugin_id || '').trim();
      if (!folder_name) {
        throw new Error(`Missing plugin id for "${plugin_label}".`);
      }

      const base_folder = `${this.app.vault.configDir}/plugins/${folder_name}`;
      await write_files_with_adapter(this.app.vault.adapter, base_folder, files);

      if (should_defer_activation) {
        this.mark_install_deferred(plugin);
      } else {
        await this.app.plugins.loadManifests();
      }

      if (install_enable_behavior.should_enable_after_install) {
        await enable_plugin(this.app, this.plugin_id);
      }

      this.env?.events?.emit?.('pro_plugins:install_completed', {
        level: should_defer_activation ? 'attention' : 'debug',
        message: should_defer_activation
          ? `${plugin_label} updated. Reload Obsidian to activate the new version.`
          : `${plugin_label} installed successfully.`,
        ...(should_defer_activation
          ? {
            btn_text: 'Reload Obsidian',
            btn_callback: 'app:reload',
          }
          : {}),
        event_source: 'browse_smart_plugins.list_item',
      });
      emit_store_event(this.env, 'pro_plugin_installed', params, {
        plugin_key: this.plugin_id,
        recommended_track: 'pro',
        event_source: 'browse_smart_plugins.list_item.install',
      });
      this.env?.events?.emit?.('smart_plugins:store_refresh', {
        event_source: 'browse_smart_plugins.list_item.install',
      });
      if (typeof params.on_installed === 'function') {
        await params.on_installed();
      }
    } catch (err) {
      console.error('[smart-plugins:list] Install error:', err);
      this.env?.events?.emit?.('pro_plugins:install_failed', {
        level: 'error',
        message: `Install failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item',
      });
    }
  }

  async install_github_release_plugin(params = {}, plugin) {
    const app = params.app || this.app;
    const env = params.env || null;
    const repo = get_plugin_repo(plugin);
    const was_installed = this.is_installed;
    const was_enabled = this.is_enabled;
    const should_defer_activation = was_installed && was_enabled;
    const plugin_label = this.get_plugin_action_label(plugin);
    const install_enable_behavior = get_install_enable_behavior({
      was_installed,
    });

    if (!repo) {
      throw new Error(`Missing GitHub repo for "${plugin_label}".`);
    }
    if (!this.plugin_id) {
      throw new Error(`Missing plugin id for "${plugin_label}".`);
    }

    try {
      env?.events?.emit?.('smart_plugins:install_started', {
        level: 'debug',
        message: `Installing "${plugin_label}" ...`,
        event_source: 'browse_smart_plugins.list_item',
      });

      const { json: release } = await this.get_latest_github_release(plugin);

      const assets = release?.assets || [];
      const main_asset = assets.find((asset) => asset.name === 'main.js');
      const manifest_asset = assets.find((asset) => asset.name === 'manifest.json');
      const styles_asset = assets.find((asset) => asset.name === 'styles.css');

      if (!main_asset || !manifest_asset || !styles_asset) {
        throw new Error('Failed to find necessary assets in the latest GitHub release.');
      }

      const plugin_folder = `${app.vault.configDir}/plugins/${this.plugin_id}`;
      if (!await app.vault.adapter.exists(plugin_folder)) {
        await app.vault.adapter.mkdir(plugin_folder);
      }

      await Promise.all([
        this.download_and_write_release_asset(app, main_asset.browser_download_url, `${plugin_folder}/main.js`),
        this.download_and_write_release_asset(app, manifest_asset.browser_download_url, `${plugin_folder}/manifest.json`),
        this.download_and_write_release_asset(app, styles_asset.browser_download_url, `${plugin_folder}/styles.css`),
      ]);

      if (should_defer_activation) {
        this.mark_install_deferred(plugin, release?.tag_name);
      } else {
        await app.plugins.loadManifests();
      }
      if (install_enable_behavior.should_enable_after_install) {
        await enable_plugin(app, this.plugin_id);
      }

      env?.events?.emit?.('smart_plugins:install_completed', {
        level: should_defer_activation ? 'attention' : 'debug',
        message: should_defer_activation
          ? `${plugin_label} updated. Reload Obsidian to activate the new version.`
          : `${plugin_label} installed successfully.`,
        ...(should_defer_activation
          ? {
            btn_text: 'Reload Obsidian',
            btn_callback: 'app:reload',
          }
          : {}),
        event_source: 'browse_smart_plugins.list_item.install_github_release_plugin',
      });
      env?.events?.emit?.('smart_plugins:store_refresh', {
        event_source: 'browse_smart_plugins.list_item.install_github_release_plugin',
      });
      if (typeof params.on_installed === 'function') {
        await params.on_installed();
      }
    } catch (err) {
      console.error('[smart-plugins:list] GitHub install error:', err);
      env?.events?.emit?.('smart_plugins:install_failed', {
        level: 'error',
        message: `Install failed: ${err.message}`,
        details: err?.stack || '',
        event_source: 'browse_smart_plugins.list_item.install_github_release_plugin',
      });
    }
  }

  async get_latest_github_release(plugin) {
    const repo = get_plugin_repo(plugin) || get_plugin_repo(this.install_target_plugin);
    return await requestUrl({
      url: `https://api.github.com/repos/${repo}/releases/latest`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      contentType: 'application/json',
    });
  }

  async download_and_write_release_asset(app, download_url, output_path) {
    const resp = await requestUrl({
      url: download_url,
      method: 'GET',
    });
    await app.vault.adapter.write(output_path, resp.text);
  }
}

function get_plugin_group_key(plugin) {
  return plugin?.plugin_id || `${get_plugin_item_type(plugin)}:${get_plugin_name(plugin)}`;
}

function get_plugin_item_type(plugin = {}) {
  return String(plugin?.item_type || '').trim();
}

function get_plugin_repo(plugin = {}) {
  return String(plugin?.item_repo || plugin?.repo || '').trim();
}

function get_plugin_name(plugin = {}) {
  return String(plugin?.item_name || plugin?.name || plugin?.plugin_id || '').trim();
}

function get_plugin_label(plugin = {}) {
  return String(
    plugin?.item_name ||
    plugin?.name ||
    plugin?.plugin_id ||
    plugin?.repo ||
    'plugin'
  ).trim();
}

function get_plugin_description(plugin = {}) {
  return String(plugin?.item_desc || plugin?.description || '').trim();
}

function get_plugin_icon_name(plugin = {}) {
  return String(plugin?.icon_name || '').trim();
}

function get_plugin_main_url(plugin = {}) {
  return String(plugin?.main_url || plugin?.url || '').trim();
}

function get_plugin_canonical_url(plugin = {}) {
  return String(
    plugin?.main_url ||
    plugin?.url ||
    plugin?.info_url ||
    plugin?.details_url ||
    plugin?.docs_url ||
    ''
  ).trim();
}

function get_plugin_details_url(plugin = {}) {
  return String(
    plugin?.details_url ||
    plugin?.docs_url ||
    plugin?.info_url ||
    plugin?.url ||
    ''
  ).trim();
}

function build_plugin_release_page_url(plugin = {}, version = '') {
  const main_url = String(plugin?.main_url || plugin?.url || '').trim();
  const version_slug = get_release_page_slug(version);
  if (!main_url || !version_slug) return '';

  const base_url = main_url
    .split('#')[0]
    .split('?')[0]
    .replace(/\/+$/, '')
  ;
  if (!base_url) return '';

  return `${base_url}/releases/${version_slug}/`;
}

function get_release_page_slug(version = '') {
  const version_pcs = normalize_release_version(version).split('.');
  const major = String(version_pcs[0] || '').trim();
  const minor = String(version_pcs[1] || '').trim();
  if (!major || !minor) return '';
  return `${major}-${minor}`;
}

function build_getting_started_url(url = '') {
  const base_url = String(url || '')
    .split('#')[0]
    .split('?')[0]
    .replace(/\/+$/, '')
  ;
  return base_url ? `${base_url}/getting-started/` : '';
}

function get_plugin_install_method(plugin = {}) {
  return String(plugin?.install_method || 'server').trim() || 'server';
}

function get_plugin_tags(plugin = {}) {
  return Array.isArray(plugin?.tags)
    ? plugin.tags
      .map((tag) => String(tag || '').trim().toLowerCase())
      .filter(Boolean)
    : []
  ;
}

function format_plugin_name(name = '') {
  return String(name || '')
    .replace(/\bSmart\s+/g, '')
    .replace(/\bPro\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  ;
}

function partition_plugin_items(plugin_items = []) {
  return plugin_items.reduce((acc, item) => {
    if (item.is_experimental) {
      acc.experimental_items.push(item);
    } else {
      acc.official_items.push(item);
    }
    return acc;
  }, {
    official_items: [],
    experimental_items: [],
  });
}

function with_utm_source(url, source) {
  if (!url) return PRO_PLUGINS_URL;
  return url.includes('?')
    ? `${url}&utm_source=${source}`
    : `${url}?utm_source=${source}`
  ;
}

function build_invalid_credentials_message(server_message = '') {
  const default_message = 'Invalid account credentials. Log out and log in again.';
  const safe_server_message = String(server_message || '').trim();

  if (!safe_server_message) {
    return default_message;
  }

  const normalized_safe_message = safe_server_message.toLowerCase();
  if (
    normalized_safe_message === 'unauthorized' ||
    normalized_safe_message === default_message.toLowerCase()
  ) {
    return default_message;
  }

  return `${default_message}\n\n${safe_server_message}`;
}
