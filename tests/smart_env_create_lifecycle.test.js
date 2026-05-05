import test from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SmartEnv as BaseSmartEnv } from 'smart-environment/smart_env.js';
import { compare_versions } from 'smart-environment/utils/compare_versions.js';
import { deep_clone_config } from 'smart-environment/utils/deep_clone_config.js';
import { merge_env_config } from 'smart-environment/utils/merge_env_config.js';
import { normalize_opts } from 'smart-environment/utils/normalize_opts.js';

function load_obsidian_smart_env_class(params = {}) {
  const dir_name = path.dirname(fileURLToPath(import.meta.url));
  const file_path = path.join(dir_name, '..', 'smart_env.js');
  const full_source = fs.readFileSync(file_path, 'utf8');
  const class_start = full_source.indexOf('export class SmartEnv');
  const class_end = full_source.indexOf('/**\n * Triggers a browser download', class_start);

  if (class_start === -1 || class_end === -1) {
    throw new Error('Unable to locate SmartEnv class in smart_env.js');
  }

  const class_source = full_source
    .slice(class_start, class_end)
    .replace('export class SmartEnv', 'class SmartEnv')
  ;

  const calls = {
    outdated_checks: 0,
    deferred_envs: [],
  };

  const context = vm.createContext({
    module: { exports: {} },
    exports: {},
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    Map,
    Set,
    BaseSmartEnv,
    compare_versions,
    deep_clone_config,
    merge_env_config,
    normalize_opts,
    pkg: { version: params.version || '2.4.3' },
    default_config: {
      env_start_wait_time: 60000,
      collections: {},
      modules: {},
      items: {},
    },
    add_smart_chat_icon() {},
    add_smart_connections_icon() {},
    add_smart_lookup_icon() {},
    add_smart_icons() {},
    handle_outdated_plugins() {
      calls.outdated_checks += 1;
    },
    handle_env_load_attempt_after_loaded(env) {
      calls.deferred_envs.push(env);
    },
    is_supported_smart_env_version(version) {
      return compare_versions(version, params.min_compatible_version || '2.4.0') >= 0;
    },
    is_global_env_locked(global_ref) {
      return Object.getOwnPropertyDescriptor(global_ref, 'smart_env')?.configurable === false;
    },
  });

  const script = new vm.Script(`${class_source}\nmodule.exports = { SmartEnv };\n`, {
    filename: file_path,
  });
  script.runInContext(context);

  return {
    SmartEnv: context.module.exports.SmartEnv,
    calls,
  };
}

function create_app() {
  const on_layout_ready_callbacks = [];

  return {
    workspace: {
      on_layout_ready_callbacks,
      protocolHandlers: new Map(),
      onLayoutReady(callback) {
        on_layout_ready_callbacks.push(callback);
        return { type: 'layout-ready', callback };
      },
      on() {
        return { type: 'workspace-event' };
      },
    },
    plugins: {
      enabledPlugins: new Set(),
      plugins: {},
      manifests: {},
    },
    setting: {
      pluginTabs: [],
    },
  };
}

class TestPluginBase {
  constructor(plugin_id) {
    this.app = create_app();
    this.manifest = { id: plugin_id };
    this.registered_events = [];
  }

  registerEvent(event_ref) {
    this.registered_events.push(event_ref);
  }
}

class FirstPlugin extends TestPluginBase {}
class SecondPlugin extends TestPluginBase {}
class ThirdPlugin extends TestPluginBase {}

function build_env_config(label) {
  return {
    env_start_wait_time: 60000,
    collections: {},
    modules: {},
    items: {},
    test_label: label,
  };
}

function stop_scheduled_load(env) {
  clearTimeout(env.load_timeout);
  env.load_timeout = null;
}

test('same-version plugin create while env is loading registers config instead of deferring', async (t) => {
  const global_ref = {};
  const { SmartEnv: ObsidianSmartEnv, calls } = load_obsidian_smart_env_class();

  class TestSmartEnv extends ObsidianSmartEnv {
    static version = '2.4.3';
    static global_ref = global_ref;
  }

  const first_plugin = new FirstPlugin('smart-first');
  const second_plugin = new SecondPlugin('smart-second');

  const env = await TestSmartEnv.create(first_plugin, build_env_config('first'));
  stop_scheduled_load(env);
  env.state = 'loading';

  const result = await TestSmartEnv.create(second_plugin, build_env_config('second'));
  stop_scheduled_load(result);

  t.is(result, env);
  t.is(calls.deferred_envs.length, 0);
  t.is(calls.outdated_checks, 2);
  t.truthy(global_ref.smart_env_configs.first_plugin);
  t.truthy(global_ref.smart_env_configs.second_plugin);
  t.is(global_ref.smart_env_configs.second_plugin.main, second_plugin);
  t.is(global_ref.smart_env_configs.second_plugin.opts.test_label, 'second');
  t.is(second_plugin.env, env);
});

test('newer SmartEnv still supersedes an older loading env before the global env locks', async (t) => {
  const global_ref = {};
  const { SmartEnv: ObsidianSmartEnv, calls } = load_obsidian_smart_env_class();

  class OldSmartEnv extends ObsidianSmartEnv {
    static version = '2.4.2';
    static global_ref = global_ref;
  }

  class NewSmartEnv extends ObsidianSmartEnv {
    static version = '2.4.3';
    static global_ref = global_ref;
  }

  const first_plugin = new FirstPlugin('smart-first');
  const second_plugin = new SecondPlugin('smart-second');

  const old_env = await OldSmartEnv.create(first_plugin, build_env_config('old'));
  stop_scheduled_load(old_env);
  old_env.state = 'loading';

  const new_env = await NewSmartEnv.create(second_plugin, build_env_config('new'));
  stop_scheduled_load(new_env);

  t.not(new_env, old_env);
  t.true(new_env instanceof NewSmartEnv);
  t.is(old_env.state, 'superceded');
  t.is(global_ref.smart_env, new_env);
  t.is(calls.deferred_envs.length, 0);
  t.truthy(global_ref.smart_env_configs.first_plugin);
  t.truthy(global_ref.smart_env_configs.second_plugin);
  t.is(global_ref.smart_env_configs.second_plugin.main, second_plugin);
});

test('loaded env still defers subsequent create attempts and does not register new config', async (t) => {
  const global_ref = {};
  const { SmartEnv: ObsidianSmartEnv, calls } = load_obsidian_smart_env_class();

  class TestSmartEnv extends ObsidianSmartEnv {
    static version = '2.4.3';
    static global_ref = global_ref;
  }

  const first_plugin = new FirstPlugin('smart-first');
  const second_plugin = new SecondPlugin('smart-second');

  const env = await TestSmartEnv.create(first_plugin, build_env_config('first'));
  stop_scheduled_load(env);
  env.state = 'loaded';

  const result = await TestSmartEnv.create(second_plugin, build_env_config('second'));

  t.is(result, env);
  t.is(calls.deferred_envs.length, 1);
  t.is(calls.deferred_envs[0], env);
  t.truthy(global_ref.smart_env_configs.first_plugin);
  t.false(Object.prototype.hasOwnProperty.call(global_ref.smart_env_configs, 'second_plugin'));
  t.is(second_plugin.env, env);
});

test('locked global env defers create attempts even before state is loaded', async (t) => {
  const global_ref = {};
  const { SmartEnv: ObsidianSmartEnv, calls } = load_obsidian_smart_env_class();

  class TestSmartEnv extends ObsidianSmartEnv {
    static version = '2.4.3';
    static global_ref = global_ref;
  }

  const first_plugin = new FirstPlugin('smart-first');
  const third_plugin = new ThirdPlugin('smart-third');

  const env = await TestSmartEnv.create(first_plugin, build_env_config('first'));
  stop_scheduled_load(env);
  env.state = 'loading';

  Object.defineProperty(global_ref, 'smart_env', {
    get() {
      return env;
    },
    set() {},
    configurable: false,
  });

  const result = await TestSmartEnv.create(third_plugin, build_env_config('third'));

  t.is(result, env);
  t.is(calls.deferred_envs.length, 1);
  t.is(calls.deferred_envs[0], env);
  t.false(Object.prototype.hasOwnProperty.call(global_ref.smart_env_configs, 'third_plugin'));
  t.is(third_plugin.env, env);
});

