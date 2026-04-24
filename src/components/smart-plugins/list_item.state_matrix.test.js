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
    compare_versions,
    compute_plugin_list_item_state,
    get_install_enable_behavior,
    convert_to_time_ago() {
      return 'ago';
    },
    convert_to_time_until() {
      return 'soon';
    },
    emit_store_event() {},
    get_oauth_storage_prefix() {
      return 'test_smart_plugins_oauth_';
    },
    infer_installed_plugin_type,
    normalize_positive_epoch_ms,
    normalize_release_version(value) {
      const normalized_value = String(value || '').trim();
      return normalized_value.replace(/^v/i, '');
    },
    pro_plugin_ids_without_pro_in_name,
    PRO_PLUGINS_URL: 'https://smartconnections.app/pro-plugins/',
    should_block_pro_install,
    should_offer_plugin_update,
    should_signal_outdated_env_compatibility,
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
    obsidian_app: {
      vault: {
        getName() {
          return 'Plugin Store Test Vault';
        },
      },
      plugins: {
        manifests,
        enabledPlugins: new Set(enabled ? [plugin_id] : []),
        plugins,
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
      details_url: params.core_details_url || 'https://core.example/plugin',
    },
    pro: {
      item_type: 'pro',
      item_name: 'Connections Pro',
      item_desc: 'Pro track',
      plugin_id,
      version: params.pro_version || '2.0.0',
      entitled: params.is_entitled === true,
      details_url: params.pro_details_url || 'https://pro.example/plugin',
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
