import test from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { merge_env_config } from 'smart-environment/utils/merge_env_config.js';
import {
  compute_plugin_list_item_state,
  get_install_enable_behavior,
  infer_installed_plugin_type,
  should_block_pro_install,
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
  if (!Number.isFinite(numeric_value) || numeric_value <= 0) return null;
  return Math.round(numeric_value);
}

function create_element() {
  const selectors = new Map();
  const listeners = new Map();
  return {
    children: [],
    style: {},
    attributes: {},
    textContent: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(event_key, callback) {
      if (!listeners.has(event_key)) listeners.set(event_key, []);
      listeners.get(event_key).push(callback);
    },
    removeEventListener(event_key, callback) {
      const next_listeners = (listeners.get(event_key) || [])
        .filter((listener) => listener !== callback)
      ;
      listeners.set(event_key, next_listeners);
    },
    contains(element) {
      return Boolean(element);
    },
    get_event_listeners(event_key) {
      return listeners.get(event_key) || [];
    },
    querySelector(selector) {
      return selectors.get(selector) || null;
    },
    querySelectorAll() {
      return [];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    set_selector(selector, element) {
      selectors.set(selector, element);
      return element;
    },
  };
}

function create_store_container() {
  const container = create_element();
  const server_message = create_element();
  server_message.set_selector('.callout-icon', create_element());
  server_message.set_selector('.callout-title-inner', create_element());
  server_message.set_selector('.callout-content', create_element());

  container.set_selector('.smart-plugins-login', create_element());
  container.set_selector('.smart-plugins-onboarding', create_element());
  container.set_selector('.smart-plugins-official-list', create_element());
  container.set_selector('.smart-plugins-experimental-section', create_element());
  container.set_selector('.smart-plugins-experimental-list', create_element());
  container.set_selector('.smart-plugins-server-message', server_message);
  return container;
}

function load_post_process(params = {}) {
  const dir_name = path.dirname(fileURLToPath(import.meta.url));
  const file_path = path.join(dir_name, 'list.js');
  const full_source = fs.readFileSync(file_path, 'utf8');
  const source_start = full_source.indexOf('export const version');
  if (source_start === -1) {
    throw new Error('Smart Plugins module body not found in list.js');
  }

  const source = full_source
    .slice(source_start)
    .replace(/\bexport\s+(?=(?:async\s+)?function|class|const)/g, '')
    .concat('\npost_process.version = version;\nmodule.exports = { post_process };\n')
  ;

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
    URL,
    TextDecoder,
    TextEncoder,
    MarkdownRenderer: {
      async render() {},
    },
    build_plugin_file_record() {
      return {};
    },
    compare_versions,
    compute_plugin_list_item_state,
    convert_to_time_ago() {
      return 'ago';
    },
    convert_to_time_until() {
      return 'soon';
    },
    disable_plugin: async () => {},
    enable_plugin: async () => {},
    fetch_plugin_file: async () => ({}),
    fetch_server_plugin_list: params.fetch_server_plugin_list,
    get_install_enable_behavior,
    get_smart_plugins_token() {
      return params.token || '';
    },
    infer_installed_plugin_type,
    install_file_names: ['manifest.json', 'main.js', 'styles.css'],
    normalize_positive_epoch_ms,
    requestUrl: async () => ({
      json: {
        tag_name: '1.0.0',
      },
    }),
    setIcon() {},
    should_block_pro_install,
    should_offer_plugin_update,
    should_signal_outdated_env_compatibility,
    styles: '',
    write_files_with_adapter: async () => {},
    window: {
      app: null,
      open(url, target) {
        params.open_calls?.push({ url, target });
      },
      location: {
        reload() {},
      },
    },
  });

  const script = new vm.Script(source, { filename: file_path });
  script.runInContext(context);
  return context.module.exports.post_process;
}

test('Store refresh events rerender without refreshing manifests', async (t) => {
  const fetch_calls = [];
  const load_manifest_calls = [];
  const open_calls = [];
  const handlers = new Map();
  const app = {
    plugins: {
      enabledPlugins: new Set(),
      manifests: {},
      plugins: {},
      async loadManifests() {
        load_manifest_calls.push(true);
      },
    },
    vault: {
      configDir: '.obsidian',
      adapter: {},
      getName() {
        return 'Plugin Store Test Vault';
      },
    },
  };
  const env = {
    plugin: { app },
    obsidian_app: app,
    plugin_states: {},
    events: {
      emit() {},
      on(event_key, callback) {
        handlers.set(event_key, callback);
        return () => handlers.delete(event_key);
      },
    },
    smart_components: {
      async render_component(component_key) {
        if (component_key === 'smart_plugins_list_item') return null;
        return create_element();
      },
    },
  };
  const smart_view = {
    attach_disposer() {},
    create_doc_fragment() {
      return {
        firstElementChild: create_element(),
      };
    },
    empty(element) {
      if (!element) return;
      element.children = [];
      element.textContent = '';
    },
  };
  const post_process = load_post_process({
    open_calls,
    fetch_server_plugin_list: async (token) => {
      fetch_calls.push(token);
      return {
        list: [],
        message: '',
        status: 200,
        sub_exp: null,
      };
    },
  });

  const store_container = create_store_container();
  await post_process.call(smart_view, env, store_container, {});

  t.is(fetch_calls.length, 1);
  t.is(load_manifest_calls.length, 0);
  t.truthy(handlers.get('smart_plugins:store_refresh'));
  t.truthy(handlers.get('pro_plugins:refresh'));

  await handlers.get('smart_plugins:store_refresh')();
  await handlers.get('pro_plugins:refresh')();

  t.is(fetch_calls.length, 3);
  t.is(load_manifest_calls.length, 0);

  const click_listeners = store_container.get_event_listeners('click');
  t.is(click_listeners.length, 1);

  const pro_badge = {
    closest(selector) {
      return selector === '[data-smart-plugins-pro-badge]' ? this : null;
    },
    getAttribute(attribute_name) {
      return attribute_name === 'data-source'
        ? 'plugin-store-smart-context'
        : ''
      ;
    },
  };
  click_listeners[0]({ target: pro_badge });

  t.deepEqual(open_calls, [{
    url: 'https://smartconnections.app/pro-plugins/?utm_source=plugin-store-smart-context',
    target: '_external',
  }]);
});


test('Store layout keeps account state full width without inherited heading styles', (t) => {
  const dir_name = path.dirname(fileURLToPath(import.meta.url));
  const file_path = path.join(dir_name, 'list.js');
  const source = fs.readFileSync(file_path, 'utf8');

  t.true(source.includes('<div class="pro-plugins-container">'));
  t.true(source.includes('<div class="setting-group smart-plugins-store">'));
  t.true(source.includes('<div class="smart-plugins-login"></div>'));
  t.true(source.includes('<div class="smart-plugins-intro" role="group" aria-label="Smart Plugin tracks">'));
  t.true(source.includes('smart-plugins-track-guide-item'));
  t.true(source.includes('data-smart-plugins-pro-badge'));
  t.true(source.includes('data-source="plugin-store-track-guide"'));
  t.is(
    (source.match(/https:\/\/smartconnections\.app\/pro-plugins\//g) || []).length,
    1
  );
  t.true(source.includes('<div class="smart-plugins-marketing-section">'));
  t.true(source.includes('<div class="smart-plugins-marketing-title">More from Smart Plugins</div>'));
  t.true(source.includes('<p class="smart-plugins-footer">'));
  t.true(source.indexOf('smart-plugins-marketing-section') < source.indexOf('smart-plugins-onboarding'));
  t.false(source.includes('pro-plugins-container setting-item-heading'));
  t.false(source.includes('<div class="setting-item setting-item-heading">'));
});

for (const [name, token, status, sub_exp] of [
  ['signed out', '', 200, null],
  ['active subscriber', 'active-token', 200, Date.now() + 86400000],
  ['expired subscriber', 'expired-token', 200, 1],
  ['invalid session', 'invalid-token', 401, null],
]) {
  test(`Store renders onboarding without referral components for ${name}`, async (t) => {
    const fetch_calls = [];
    const component_calls = [];
    const app = {
      plugins: { enabledPlugins: new Set(), manifests: {}, plugins: {} },
      vault: { configDir: '.obsidian', adapter: {}, getName() { return 'Test Vault'; } },
    };
    const env = {
      plugin: { app },
      obsidian_app: app,
      plugin_states: {},
      events: { emit() {}, on() { return () => {}; } },
      smart_components: {
        async render_component(component_key, scope, params) {
          component_calls.push({ component_key, params });
          t.true(['smart_plugins_login', 'smart_plugins_onboarding', 'smart_plugins_list_item'].includes(component_key));
          if (component_key === 'smart_plugins_list_item') return null;
          return create_element();
        },
      },
    };
    const post_process = load_post_process({
      token,
      fetch_server_plugin_list: async (request_token) => {
        fetch_calls.push(request_token);
        return {
          list: [],
          status: request_token ? status : 200,
          sub_exp,
          message: '',
        };
      },
    });
    const view = {
      attach_disposer() {},
      empty(element) {
        element.children = [];
        element.textContent = '';
      },
    };
    const container = create_store_container();
    await post_process.call(view, env, container);

    t.deepEqual(fetch_calls, status === 401 ? [token, ''] : [token]);
    const onboarding_calls = component_calls.filter((call) => call.component_key === 'smart_plugins_onboarding');
    t.is(onboarding_calls.length, 1);
    t.is(onboarding_calls[0].params.token, undefined);
    t.is(onboarding_calls[0].params.sub_exp, undefined);
    t.is(container.querySelector('.smart-plugins-onboarding').children.length, 1);
    const login_calls = component_calls.filter((call) => call.component_key === 'smart_plugins_login');
    t.is(login_calls.at(-1).params.auth_state, status === 401 ? 'invalid' : token ? 'signed_in' : 'signed_out');
  });
}

test('Cleaned store component wins over an older plugin in either load order', (t) => {
  const new_render = load_post_process();
  const old_render = () => {};
  for (const old_first of [true, false]) {
    const old_config = {
      version: '3.1.3',
      components: { smart_plugins_list: { render: old_render, version: '1.0.3' } },
    };
    const new_config = {
      version: '3.1.3',
      components: { smart_plugins_list: { render: new_render, version: new_render.version } },
    };
    const merged = {};
    merge_env_config(merged, old_first ? old_config : new_config);
    merge_env_config(merged, old_first ? new_config : old_config);
    t.is(merged.components.smart_plugins_list.render, new_render);
  }
});
