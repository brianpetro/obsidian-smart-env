import test from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  compute_plugin_list_item_state,
  get_install_enable_behavior,
  infer_installed_plugin_type,
  pro_plugin_ids_without_pro_in_name,
  should_offer_plugin_update,
  should_signal_outdated_env_compatibility,
} from '../../utils/smart_plugins_state.js';

function compare_versions(left = '', right = '') {
  const left_parts = String(left || '').split('.').map((part) => Number(part) || 0);
  const right_parts = String(right || '').split('.').map((part) => Number(part) || 0);
  const length = Math.max(left_parts.length, right_parts.length);

  for (let i = 0; i < length; i += 1) {
    const left_value = left_parts[i] || 0;
    const right_value = right_parts[i] || 0;
    if (left_value === right_value) continue;
    return left_value > right_value ? 1 : -1;
  }

  return 0;
}

function normalize_positive_epoch_ms(value) {
  const numeric_value = Number(value);
  if (!Number.isFinite(numeric_value) || numeric_value <= 0) {
    return null;
  }
  return Math.round(numeric_value);
}

function should_block_pro_install(params = {}) {
  return String(params.item_type || '').trim() === 'pro'
    && params.is_entitled !== true
  ;
}

function load_plugin_list_item(params = {}) {
  const dir_name = path.dirname(fileURLToPath(import.meta.url));
  const file_path = path.join(dir_name, 'list.js');
  const full_source = fs.readFileSync(file_path, 'utf8');
  const class_start = full_source.indexOf('export class PluginListItem');
  if (class_start === -1) {
    throw new Error('PluginListItem class not found in list.js');
  }

  const source = full_source
    .slice(class_start)
    .replace('export class PluginListItem', 'class PluginListItem')
    .concat('\nmodule.exports = { PluginListItem };\n')
  ;

  const open_calls = params.open_calls || [];
  const context = vm.createContext({
    module: { exports: {} },
    exports: {},
    console,
    Date,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Array,
    JSON,
    Math,
    build_plugin_file_record: params.build_plugin_file_record || (() => ({})),
    compare_versions,
    compute_plugin_list_item_state,
    convert_to_time_ago() {
      return 'ago';
    },
    convert_to_time_until() {
      return 'soon';
    },
    emit_store_event() {},
    disable_plugin: params.disable_plugin || (async () => {}),
    enable_plugin: params.enable_plugin || (async () => {}),
    fetch_plugin_file: params.fetch_plugin_file || (async () => ({})),
    get_install_enable_behavior,
    get_oauth_storage_prefix() {
      return 'test_smart_plugins_oauth_';
    },
    infer_installed_plugin_type,
    install_file_names: ['manifest.json', 'main.js', 'styles.css'],
    normalize_positive_epoch_ms,
    normalize_release_version(value) {
      const normalized_value = String(value || '').trim();
      return normalized_value.replace(/^v/i, '');
    },
    pro_plugin_ids_without_pro_in_name,
    PRO_PLUGINS_URL: 'https://smartconnections.app/pro-plugins/',
    requestUrl: params.request_url || (async () => ({ json: {} })),
    should_block_pro_install,
    should_offer_plugin_update,
    should_signal_outdated_env_compatibility,
    write_files_with_adapter: params.write_files_with_adapter || (async () => {}),
    localStorage: {
      getItem() {
        return '';
      },
    },
    window: {
      open(url, target) {
        open_calls.push({ url, target });
      },
      location: {
        reload() {},
      },
    },
  });

  const script = new vm.Script(source, { filename: file_path });
  script.runInContext(context);
  return {
    PluginListItem: context.module.exports.PluginListItem,
    open_calls,
  };
}

function create_env(params = {}) {
  const plugin_id = params.plugin_id || 'smart-connections';
  const installed_manifest = params.installed_manifest || null;
  const loaded_version = params.loaded_version || '';
  const loaded_env_version = params.loaded_env_version || '2.5.4';
  const enabled = params.enabled === true;
  const env_plugin_state = params.env_plugin_state || '';
  const emitted_events = params.emitted_events || [];
  const load_manifest_calls = params.load_manifest_calls || [];
  const save_config_calls = params.save_config_calls || [];

  const manifests = installed_manifest
    ? { [plugin_id]: installed_manifest }
    : {}
  ;
  const loaded_plugin = loaded_version
    ? {
      manifest: { version: loaded_version },
      SmartEnv: loaded_env_version ? { version: loaded_env_version } : {},
    }
    : loaded_env_version
      ? {
        SmartEnv: { version: loaded_env_version },
      }
      : null
  ;
  const plugins = loaded_plugin
    ? { [plugin_id]: loaded_plugin }
    : {}
  ;

  return {
    plugin_states: env_plugin_state
      ? { [plugin_id]: env_plugin_state }
      : {},
    events: {
      emit(event_key, event = {}) {
        emitted_events.push({ event_key, event });
      },
    },
    obsidian_app: {
      vault: {
        configDir: '.obsidian',
        adapter: {},
        getName() {
          return 'Plugin Store Test Vault';
        },
      },
      plugins: {
        manifests,
        enabledPlugins: new Set(enabled ? [plugin_id] : []),
        plugins,
        requestSaveConfig() {
          save_config_calls.push(plugin_id);
        },
        async loadManifests() {
          load_manifest_calls.push(plugin_id);
          if (typeof params.load_manifests === 'function') {
            await params.load_manifests();
          }
        },
      },
    },
  };
}

function create_group_plugins(params = {}) {
  const plugin_id = params.plugin_id || 'smart-connections';
  return {
    core: {
      item_type: 'core',
      item_name: 'Smart Connections',
      item_desc: 'Core track',
      plugin_id,
      version: params.core_version || '1.0.0',
      icon_name: params.core_icon_name || 'smart-connections',
      last_updated: params.core_last_updated || 1_700_000_000_000,
      main_url: params.core_main_url || 'https://core.example/plugin/',
      details_url: params.core_details_url || 'https://core.example/details/',
      docs_url: params.core_docs_url || 'https://core.example/docs/',
      info_url: params.core_info_url || 'https://core.example/learn/',
    },
    pro: {
      item_type: 'pro',
      item_name: 'Connections Pro',
      item_desc: 'Pro track',
      plugin_id,
      version: params.pro_version || '2.0.0',
      icon_name: params.pro_icon_name || 'smart-connections',
      last_updated: params.pro_last_updated || 1_700_000_000_000,
      main_url: params.pro_main_url || 'https://pro.example/plugin/',
      details_url: params.pro_details_url || 'https://pro.example/details/',
      docs_url: params.pro_docs_url || 'https://pro.example/docs/',
      info_url: params.pro_info_url || 'https://pro.example/learn/',
      entitled: params.is_entitled === true,
    },
  };
}

function create_plugin_list_item(params = {}) {
  const { PluginListItem } = load_plugin_list_item();
  const env = create_env(params.env || {});
  const plugins = create_group_plugins(params.plugins || {});
  return new PluginListItem(env, plugins, {
    root_sub_exp: params.root_sub_exp ?? null,
  });
}

test('PluginListItem state matrix', (t) => {
  const cases = [
    {
      name: 'guest grouped pair',
      plugins: { is_entitled: false },
      expected_core_state: 'can_install_core_only',
      expected_pro_state: 'cant_install',
    },
    {
      name: 'entitled grouped pair',
      plugins: { is_entitled: true },
      expected_core_state: 'included_in_pro',
      expected_pro_state: 'can_install_pro',
    },
    {
      name: 'core installed and loaded',
      env: {
        installed_manifest: { name: 'Smart Connections', version: '1.0.0' },
        enabled: true,
        loaded_version: '1.0.0',
        env_plugin_state: 'loaded',
      },
      plugins: { is_entitled: false, core_version: '1.0.0' },
      expected_core_state: 'loaded',
      expected_pro_state: 'core_installed',
    },
    {
      name: 'core update available',
      env: {
        installed_manifest: { name: 'Smart Connections', version: '1.0.0' },
        enabled: true,
        loaded_version: '1.0.0',
        env_plugin_state: 'loaded',
      },
      plugins: { is_entitled: false, core_version: '1.1.0' },
      expected_core_state: 'update_available',
      expected_pro_state: 'core_installed',
    },
    {
      name: 'pro installed and loaded',
      env: {
        installed_manifest: { name: 'Connections Pro', version: '2.0.0' },
        enabled: true,
        loaded_version: '2.0.0',
        env_plugin_state: 'loaded',
      },
      plugins: { is_entitled: true, pro_version: '2.0.0' },
      expected_core_state: 'included_in_pro',
      expected_pro_state: 'loaded',
    },
    {
      name: 'pro installed but disabled',
      env: {
        installed_manifest: { name: 'Connections Pro', version: '2.0.0' },
        enabled: false,
        loaded_version: '2.0.0',
      },
      plugins: { is_entitled: true, pro_version: '2.0.0' },
      expected_core_state: 'included_in_pro',
      expected_pro_state: 'can_enable',
    },
    {
      name: 'pro installed not entitled newer server does not offer update',
      env: {
        installed_manifest: { name: 'Connections Pro', version: '2.0.0' },
        enabled: true,
        loaded_version: '2.0.0',
        env_plugin_state: 'loaded',
      },
      plugins: { is_entitled: false, pro_version: '2.1.0' },
      expected_core_state: 'included_in_pro',
      expected_pro_state: 'loaded',
      expected_should_update: false,
    },
    {
      name: 'pro installed deferred after update',
      env: {
        installed_manifest: { name: 'Connections Pro', version: '2.0.0' },
        enabled: true,
        loaded_version: '1.9.0',
        env_plugin_state: 'deferred',
      },
      plugins: { is_entitled: true, pro_version: '2.0.0' },
      expected_core_state: 'included_in_pro',
      expected_pro_state: 'deferred',
    },
  ];

  for (const test_case of cases) {
    const item = create_plugin_list_item(test_case);
    t.is(
      item.get_track_state('core')?.control_state,
      test_case.expected_core_state,
      `${test_case.name} core state`
    );
    t.is(
      item.get_track_state('pro')?.control_state,
      test_case.expected_pro_state,
      `${test_case.name} pro state`
    );

    if (Object.hasOwn(test_case, 'expected_should_update')) {
      t.is(
        item.should_update,
        test_case.expected_should_update,
        `${test_case.name} should_update`
      );
    }
  }
});

test('PluginListItem control copy covers every state with consistent runtime labels', (t) => {
  const entitled_item = create_plugin_list_item({
    plugins: { is_entitled: true },
  });
  const blocked_item = create_plugin_list_item({
    plugins: { is_entitled: false },
  });

  const text_for = (item, state, item_type = 'core') => {
    return item.get_control_specs_for_state(state, item_type)
      .map((control) => control.text)
    ;
  };

  t.deepEqual(text_for(entitled_item, 'loaded'), [
    'Active',
    'Open settings',
    'Enabled',
  ]);
  t.deepEqual(text_for(entitled_item, 'installed'), [
    'Enabled',
    'Enabled',
  ]);
  t.deepEqual(text_for(entitled_item, 'can_enable'), [
    'Installed',
    'Enable',
  ]);
  t.deepEqual(text_for(entitled_item, 'deferred'), [
    'Reload required to activate',
    'Enabled',
  ]);
  t.deepEqual(text_for(entitled_item, 'outdated_env'), [
    'Reload required for Smart Environment',
    'Enabled',
  ]);
  t.deepEqual(text_for(entitled_item, 'update_available'), [
    'Installed',
    'Update to v1.0.0',
    'Enabled',
  ]);
  t.deepEqual(text_for(entitled_item, 'included_in_pro'), [
    'Included in Pro',
  ]);
  t.deepEqual(text_for(entitled_item, 'core_installed', 'pro'), [
    'Core installed',
    'Install Pro',
  ]);
  t.deepEqual(text_for(entitled_item, 'can_install_core_only'), [
    'Install Core',
  ]);
  t.deepEqual(text_for(entitled_item, 'can_install_pro', 'pro'), [
    'Install Pro',
  ]);
  t.deepEqual(text_for(blocked_item, 'cant_install', 'pro'), [
    'Requires Pro',
    'Install Pro',
  ]);
  t.deepEqual(text_for(entitled_item, 'can_install'), [
    'Install',
  ]);
});

test('PluginListItem uses toggles for install and enable controls', (t) => {
  const guest_item = create_plugin_list_item({
    plugins: { is_entitled: false },
  });
  const loaded_item = create_plugin_list_item({
    env: {
      installed_manifest: { name: 'Connections Pro', version: '2.0.0' },
      enabled: true,
      loaded_version: '2.0.0',
      env_plugin_state: 'loaded',
    },
    plugins: { is_entitled: true, pro_version: '2.0.0' },
  });

  t.deepEqual(
    JSON.parse(JSON.stringify(guest_item.get_track_control_specs('core'))),
    [
      { type: 'toggle', item_type: 'core', value: false, text: 'Install Core' },
    ]
  );
  t.deepEqual(
    JSON.parse(JSON.stringify(guest_item.get_track_control_specs('pro'))),
    [
      { type: 'status', text: 'Requires Pro' },
      { type: 'toggle', item_type: 'pro', value: false, text: 'Install Pro', disabled: true },
    ]
  );
  t.deepEqual(
    JSON.parse(JSON.stringify(loaded_item.get_track_control_specs('pro'))),
    [
      { type: 'status', text: 'Active' },
      { type: 'button', action: 'open_settings', text: 'Open settings', variant: 'secondary' },
      { type: 'toggle', item_type: 'pro', value: true, text: 'Enabled' },
    ]
  );
});

test('PluginListItem merges update and reload guidance into versioned action buttons', (t) => {
  const update_item = create_plugin_list_item({
    env: {
      installed_manifest: { name: 'Smart Connections', version: '1.0.0' },
      enabled: true,
      loaded_version: '1.0.0',
      env_plugin_state: 'loaded',
    },
    plugins: { core_version: '1.1.0' },
  });
  const deferred_item = create_plugin_list_item({
    env: {
      installed_manifest: { name: 'Connections Pro', version: '2.0.0' },
      enabled: true,
      loaded_version: '1.9.0',
      env_plugin_state: 'deferred',
    },
    plugins: { is_entitled: true, pro_version: '2.0.0' },
  });

  t.deepEqual(
    JSON.parse(JSON.stringify(update_item.get_track_control_specs('core'))),
    [
      { type: 'status', text: 'Active' },
      { type: 'button', action: 'install', text: 'Update to v1.1.0', variant: 'primary' },
      { type: 'toggle', item_type: 'core', value: true, text: 'Enabled' },
    ]
  );
  t.deepEqual(
    JSON.parse(JSON.stringify(deferred_item.get_track_control_specs('pro'))),
    [
      { type: 'button', action: 'restart_obsidian', text: 'Reload required to activate v2.0.0', variant: 'primary' },
      { type: 'toggle', item_type: 'pro', value: true, text: 'Enabled' },
    ]
  );
});

test('PluginListItem shows current and available versions when they differ', (t) => {
  const item = create_plugin_list_item({
    env: {
      installed_manifest: { name: 'Smart Connections', version: '1.0.0' },
      enabled: true,
      loaded_version: '1.0.0',
      env_plugin_state: 'loaded',
    },
    plugins: {
      core_version: '1.1.0',
    },
  });

  t.is(
    item.get_track_meta_text('core'),
    'Current v1.0.0 - Available v1.1.0 - Updated ago'
  );
  t.is(item.get_track_meta_text('pro'), 'v2.0.0 - Updated ago');

  const newer_current_item = create_plugin_list_item({
    env: {
      installed_manifest: { name: 'Smart Connections', version: '2.0.0' },
      enabled: true,
      loaded_version: '2.0.0',
      env_plugin_state: 'loaded',
    },
    plugins: {
      core_version: '1.3.3',
    },
  });

  t.is(
    newer_current_item.get_track_meta_text('core'),
    'Current v2.0.0 - Store v1.3.3 - Updated ago'
  );
});

test('PluginListItem exposes icon, release metadata, and listing links', (t) => {
  const item = create_plugin_list_item({
    env: {
      installed_manifest: { name: 'Smart Connections', version: '1.0.0' },
      enabled: true,
      loaded_version: '1.0.0',
      env_plugin_state: 'loaded',
    },
    plugins: {
      core_version: '1.0.0',
      core_main_url: 'https://core.example/plugin/',
      core_details_url: 'https://core.example/details/',
      core_docs_url: 'https://core.example/docs/',
      core_info_url: 'https://core.example/learn/',
    },
  });

  t.is(item.get_track_icon_name('core'), 'smart-connections');
  t.is(item.get_track_meta_text('core'), 'v1.0.0 - Updated ago');
  t.deepEqual(
    JSON.parse(JSON.stringify(item.get_track_link_items('core'))),
    [
      { title: 'Release notes', icon: 'file-text', url: 'https://core.example/plugin/releases/1-0/' },
      { title: 'Getting started', icon: 'rocket', url: 'https://core.example/plugin/getting-started/' },
      { title: 'Obsidian plugin listing', icon: 'obsidian', url: 'https://community.obsidian.md/plugins/smart-connections' },
      { title: 'Details', icon: 'info', url: 'https://core.example/details/' },
      { title: 'Documentation', icon: 'book-open', url: 'https://core.example/docs/' },
      { title: 'Learn more', icon: 'help-circle', url: 'https://core.example/learn/' },
    ]
  );
  const pro_links = item.get_track_link_items('pro');
  t.false(
    pro_links.some((link) => link.url.includes('community.obsidian.md/plugins/'))
  );
  t.true(
    pro_links.some((link) => link.title === 'Plugin page')
  );
});

test('toggling an enabled plugin off defers disable until reload', async (t) => {
  const emitted_events = [];
  const load_manifest_calls = [];
  const save_config_calls = [];
  const disable_calls = [];
  const { PluginListItem } = load_plugin_list_item({
    disable_plugin: async (app, plugin_id) => {
      disable_calls.push(plugin_id);
      app.plugins.enabledPlugins.delete(plugin_id);
      app.plugins.requestSaveConfig();
    },
  });
  const env = create_env({
    installed_manifest: { id: 'smart-connections', name: 'Smart Connections', version: '1.0.0' },
    enabled: true,
    loaded_version: '1.0.0',
    env_plugin_state: 'loaded',
    emitted_events,
    load_manifest_calls,
    save_config_calls,
  });
  const item = new PluginListItem(
    env,
    create_group_plugins({ core_version: '1.0.0' }),
    {}
  );

  t.true(await item.handle_toggle('core', false));
  t.deepEqual(disable_calls, ['smart-connections']);
  t.deepEqual(save_config_calls, ['smart-connections']);
  t.is(load_manifest_calls.length, 0);
  t.false(env.obsidian_app.plugins.enabledPlugins.has('smart-connections'));
  t.true(env.pending_plugin_disables['smart-connections']);
  t.is(item.get_track_state('core')?.control_state, 'deferred');
  t.deepEqual(
    JSON.parse(JSON.stringify(item.get_track_control_specs('core'))),
    [
      { type: 'button', action: 'restart_obsidian', text: 'Reload required to disable', variant: 'primary' },
      { type: 'toggle', item_type: 'core', value: false, text: 'Enabled' },
    ]
  );

  const completed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'smart_plugins:disable_completed';
  });
  t.truthy(completed_event);
  t.is(completed_event.event.level, 'attention');
  t.is(completed_event.event.btn_callback, 'app:reload');
  t.true(completed_event.event.message.includes('after reloading Obsidian'));
  t.true(emitted_events.some(({ event_key }) => event_key === 'smart_plugins:store_refresh'));
});

test('toggling a pending disable back on restores config without reloading the plugin', async (t) => {
  const save_config_calls = [];
  const enable_calls = [];
  const { PluginListItem } = load_plugin_list_item({
    disable_plugin: async (app, plugin_id) => {
      app.plugins.enabledPlugins.delete(plugin_id);
      app.plugins.requestSaveConfig();
    },
    enable_plugin: async (app, plugin_id) => {
      enable_calls.push(plugin_id);
      app.plugins.enabledPlugins.add(plugin_id);
    },
  });
  const env = create_env({
    installed_manifest: { id: 'smart-connections', name: 'Smart Connections', version: '1.0.0' },
    enabled: true,
    loaded_version: '1.0.0',
    env_plugin_state: 'loaded',
    save_config_calls,
  });
  const item = new PluginListItem(
    env,
    create_group_plugins({ core_version: '1.0.0' }),
    {}
  );

  await item.handle_toggle('core', false);
  t.true(await item.handle_toggle('core', true));

  t.deepEqual(save_config_calls, ['smart-connections', 'smart-connections']);
  t.deepEqual(enable_calls, []);
  t.true(env.obsidian_app.plugins.enabledPlugins.has('smart-connections'));
  t.falsy(env.pending_plugin_disables['smart-connections']);
  t.is(item.get_track_state('core')?.control_state, 'loaded');
});

test('PluginListItem track details action uses clicked row URL', async (t) => {
  const open_calls = [];
  const { PluginListItem } = load_plugin_list_item({ open_calls });

  const item = new PluginListItem(
    create_env(),
    create_group_plugins({
      core_details_url: 'https://core.example/plugin',
      pro_details_url: 'https://pro.example/plugin',
    }),
    {}
  );

  await item.handle_track_action('core', 'open_details');
  await item.handle_track_action('pro', 'open_details');

  t.deepEqual(open_calls, [
    { url: 'https://core.example/plugin?utm_source=plugin-store', target: '_external' },
    { url: 'https://pro.example/plugin?utm_source=plugin-store', target: '_external' },
  ]);
});

test('enabled Core to Pro install defers activation until reload', async (t) => {
  const emitted_events = [];
  const load_manifest_calls = [];
  const enable_calls = [];
  const write_calls = [];
  const { PluginListItem } = load_plugin_list_item({
    enable_plugin: async (app, plugin_id) => {
      enable_calls.push({ app, plugin_id });
    },
    write_files_with_adapter: async (adapter, base_folder, files) => {
      write_calls.push({ adapter, base_folder, files });
    },
  });
  const env = create_env({
    installed_manifest: { id: 'smart-connections', name: 'Smart Connections', version: '1.0.0' },
    enabled: true,
    loaded_version: '1.0.0',
    env_plugin_state: 'loaded',
    emitted_events,
    load_manifest_calls,
    load_manifests() {
      throw new TypeError("Cannot read properties of undefined (reading 'e')");
    },
  });
  const item = new PluginListItem(
    env,
    create_group_plugins({ is_entitled: true, pro_version: '2.0.0' }),
    {}
  );
  item.download_plugin_files = async () => [
    { fileName: 'manifest.json', data: new Uint8Array(), accessed_at: 1 },
    { fileName: 'main.js', data: new Uint8Array(), accessed_at: 1 },
    { fileName: 'styles.css', data: new Uint8Array(), accessed_at: 1 },
  ];

  await item.install_plugin({}, item.pro_plugin);

  t.is(write_calls.length, 1);
  t.is(load_manifest_calls.length, 0);
  t.is(enable_calls.length, 0);
  t.deepEqual(
    JSON.parse(JSON.stringify(env.pending_plugin_installs['smart-connections'])),
    { item_type: 'pro', version: '2.0.0' }
  );
  t.is(env.plugin_states['smart-connections'], 'deferred');
  t.is(item.installed_type, 'pro');
  t.is(item.installed_version, '2.0.0');
  t.is(item.get_track_state('pro')?.control_state, 'deferred');

  const completed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'pro_plugins:install_completed';
  });
  t.truthy(completed_event);
  t.is(completed_event.event.level, 'attention');
  t.is(completed_event.event.btn_callback, 'app:reload');
  t.true(completed_event.event.message.includes('Reload Obsidian'));
  t.true(emitted_events.some(({ event_key }) => event_key === 'smart_plugins:store_refresh'));
  t.false(emitted_events.some(({ event_key }) => event_key === 'pro_plugins:refresh'));
  t.false(emitted_events.some(({ event_key }) => event_key === 'pro_plugins:install_failed'));
});

test('new Pro install still refreshes manifests and enables the plugin', async (t) => {
  const emitted_events = [];
  const load_manifest_calls = [];
  const enable_calls = [];
  const { PluginListItem } = load_plugin_list_item({
    enable_plugin: async (app, plugin_id) => {
      enable_calls.push({ app, plugin_id });
    },
  });
  const env = create_env({
    enabled: false,
    emitted_events,
    load_manifest_calls,
  });
  const item = new PluginListItem(
    env,
    create_group_plugins({ is_entitled: true, pro_version: '2.0.0' }),
    {}
  );
  item.download_plugin_files = async () => [];

  await item.install_plugin({}, item.pro_plugin);

  t.is(load_manifest_calls.length, 1);
  t.is(enable_calls.length, 1);
  t.falsy(env.pending_plugin_installs);
  t.true(emitted_events.some(({ event_key }) => event_key === 'smart_plugins:store_refresh'));
});
