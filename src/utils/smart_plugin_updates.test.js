import test from 'ava';
import * as smart_plugin_updates from './smart_plugin_updates.js';

const {
  build_update_available_message,
  check_for_smart_plugin_updates,
  collect_installed_smart_plugin_updates,
  update_all_installed_entitled_pro_plugins,
} = smart_plugin_updates;

test('Core update module does not expose former Pro updater compatibility APIs', (t) => {
  t.false(Object.hasOwn(smart_plugin_updates, 'get_matching_installed_pro_server_item'));
  t.false(Object.hasOwn(smart_plugin_updates, 'should_auto_update_installed_plugin'));
  t.false(Object.hasOwn(smart_plugin_updates, 'update_installed_smart_plugins'));
  t.true(Object.hasOwn(smart_plugin_updates, 'update_all_installed_entitled_pro_plugins'));
});

test('collect_installed_smart_plugin_updates respects installed track and Pro entitlement', (t) => {
  const updates = collect_installed_smart_plugin_updates({
    installed_manifests: {
      'smart-connections': {
        id: 'smart-connections',
        name: 'Connections Pro',
        version: '2.0.0',
      },
      'smart-context': {
        id: 'smart-context',
        name: 'Smart Context',
        version: '1.0.0',
      },
      'smart-chat': {
        id: 'smart-chat',
        name: 'Chat Pro',
        version: '1.0.0',
      },
      'smart-file-nav': {
        id: 'smart-file-nav',
        name: 'File Nav',
        version: '1.0.0',
      },
      'paired-experimental': {
        id: 'paired-experimental',
        name: 'Paired Experimental',
        version: '1.0.0',
      },
    },
    catalog: [
      {
        item_type: 'core',
        plugin_id: 'smart-connections',
        item_name: 'Smart Connections',
        item_repo: 'example/connections-core',
        version: '4.0.0',
      },
      {
        item_type: 'pro',
        plugin_id: 'smart-connections',
        item_name: 'Connections Pro',
        repo: 'example/connections-pro',
        version: '2.1.0',
        entitled: true,
      },
      {
        item_type: 'core',
        plugin_id: 'smart-context',
        item_name: 'Smart Context',
        item_repo: 'example/context-core',
        version: '1.2.0',
      },
      {
        item_type: 'pro',
        plugin_id: 'smart-context',
        item_name: 'Context Pro',
        repo: 'example/context-pro',
        version: '3.0.0',
        entitled: true,
      },
      {
        item_type: 'pro',
        plugin_id: 'smart-chat',
        item_name: 'Chat Pro',
        repo: 'example/chat-pro',
        version: '1.1.0',
        entitled: false,
      },
      {
        item_type: 'pro',
        plugin_id: 'smart-file-nav',
        item_name: 'File Nav',
        repo: 'example/file-nav',
        version: '1.1.0',
        entitled: true,
      },
      {
        item_type: 'pro',
        plugin_id: 'paired-experimental',
        item_name: 'Paired Experimental Pro',
        repo: 'example/paired-experimental-pro',
        core_repo: 'example/paired-experimental-core',
        version: '2.0.0',
        entitled: true,
      },
    ],
  });

  t.deepEqual(
    updates.map((update) => ({
      plugin_id: update.plugin_id,
      item_type: update.item_type,
      version: update.version,
    })),
    [
      {
        plugin_id: 'smart-connections',
        item_type: 'pro',
        version: '2.1.0',
      },
      {
        plugin_id: 'smart-file-nav',
        item_type: 'pro',
        version: '1.1.0',
      },
      {
        plugin_id: 'smart-context',
        item_type: 'core',
        version: '1.2.0',
      },
    ],
  );
});

test('pending installed version prevents the same update from being offered again', (t) => {
  const updates = collect_installed_smart_plugin_updates({
    installed_manifests: {
      'smart-connections': {
        id: 'smart-connections',
        name: 'Connections Pro',
        version: '2.0.0',
      },
    },
    pending_plugin_installs: {
      'smart-connections': {
        item_type: 'pro',
        version: '2.1.0',
      },
    },
    catalog: [
      {
        item_type: 'pro',
        plugin_id: 'smart-connections',
        name: 'Connections Pro',
        repo: 'example/connections-pro',
        version: '2.1.0',
        entitled: true,
      },
    ],
  });

  t.deepEqual(updates, []);
});

test('startup update check emits one deduplicated Store-opening notification', async (t) => {
  const emitted_events = [];
  const env = create_env({ emitted_events });
  env.obsidian_app.plugins.manifests = {
    'smart-connections': {
      id: 'smart-connections',
      name: 'Smart Connections',
      version: '1.0.0',
    },
  };

  const params = {
    token: '',
    async fetch_server_plugin_list_fn() {
      return { list: [], status: 200 };
    },
    async hydrate_core_plugin_versions_fn(catalog) {
      const core_plugin = catalog.find((plugin) => {
        return plugin.plugin_id === 'smart-connections'
          && plugin.item_type === 'core'
        ;
      });
      core_plugin.version = '1.1.0';
      return catalog;
    },
  };

  const first_updates = await check_for_smart_plugin_updates(env, params);
  const second_updates = await check_for_smart_plugin_updates(env, params);

  t.is(first_updates.length, 1);
  t.is(second_updates.length, 1);
  const notice_events = emitted_events.filter(({ event_key }) => {
    return event_key === 'smart_plugins:updates_available';
  });
  t.is(notice_events.length, 1);
  t.is(notice_events[0].event.btn_text, 'Open Plugin Store');
  t.is(notice_events[0].event.btn_event_key, 'smart_plugins:browse');
  t.true(notice_events[0].event.message.includes('may cause compatibility issues'));
});

test('check_for_smart_plugin_updates fails closed for an invalid authenticated update request', async (t) => {
  const emitted_events = [];
  const env = create_env({ emitted_events });

  const error = await t.throwsAsync(() => {
    return check_for_smart_plugin_updates(env, {
      token: 'expired-token',
      notify: false,
      require_authenticated: true,
      require_server_catalog: true,
      async fetch_server_plugin_list_fn() {
        return {
          list: [],
          status: 401,
          message: 'Unauthorized',
        };
      },
    });
  });

  t.is(error.code, 'smart_plugins_unauthorized');
  t.true(emitted_events.some(({ event_key }) => {
    return event_key === 'pro_plugins:oauth_token_rejected';
  }));
});

test('update all changes no files when the authenticated session is invalid', async (t) => {
  const operations = [];
  const emitted_events = [];
  const env = create_env({ emitted_events, adapter_operations: operations });
  let download_calls = 0;

  const result = await update_all_installed_entitled_pro_plugins(env, {
    token: 'expired-token',
    ...create_update_check_params([], {
      status: 401,
      message: 'Unauthorized',
    }),
    async fetch_plugin_file_fn() {
      download_calls += 1;
      return {};
    },
  });

  t.deepEqual(result, []);
  t.is(download_calls, 0);
  t.false(operations.some((operation) => operation.startsWith('write:')));
  const failed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'pro_plugins:update_all_failed';
  });
  t.is(failed_event.event.failure_state, 'unauthorized');
});

test('update all always uses a fresh resolved update set', async (t) => {
  const update = create_pro_update({
    plugin_id: 'smart-connections',
    name: 'Connections Pro',
    repo: 'example/connections-pro',
    installed_version: '2.0.0',
    version: '2.1.0',
  });
  const env = create_env();
  let resolve_calls = 0;
  const result = await update_all_installed_entitled_pro_plugins(env, {
    token: 'token',
    updates: [create_pro_update({
      plugin_id: 'ignored-plugin',
      name: 'Ignored Pro',
      repo: 'example/ignored-pro',
      installed_version: '1.0.0',
      version: '9.0.0',
    })],
    ...create_update_check_params([update], {
      on_fetch() {
        resolve_calls += 1;
      },
    }),
    ...create_download_params([update]),
  });

  t.is(resolve_calls, 1);
  t.deepEqual(result, [
    { plugin_id: 'smart-connections', version: '2.1.0' },
  ]);
  t.false(env.obsidian_app.vault.adapter.files.has('.obsidian/plugins/ignored-plugin/main.js'));
});

test('concurrent update-all actions share one update operation', async (t) => {
  const update = create_pro_update({
    plugin_id: 'smart-connections',
    name: 'Connections Pro',
    repo: 'example/connections-pro',
    installed_version: '2.0.0',
    version: '2.1.0',
  });
  const env = create_env();
  let release_first_fetch;
  const first_fetch_gate = new Promise((resolve) => {
    release_first_fetch = resolve;
  });
  let fetch_count = 0;
  const download_params = create_download_params([update], {
    async on_fetch() {
      fetch_count += 1;
      if (fetch_count === 1) await first_fetch_gate;
    },
  });
  const params = {
    token: 'token',
    ...create_update_check_params([update]),
    ...download_params,
  };

  const first_update = update_all_installed_entitled_pro_plugins(env, params);
  const second_update = update_all_installed_entitled_pro_plugins(env, params);

  t.is(first_update, second_update);
  release_first_fetch();
  await first_update;
  t.is(fetch_count, 3);
  t.is(env._smart_plugin_update_all_promise, null);
});

test('update all stages every file, writes manifest last, and always requires reload', async (t) => {
  const operations = [];
  const emitted_events = [];
  const lifecycle_calls = [];
  const updates = [
    create_pro_update({
      plugin_id: 'smart-connections',
      name: 'Connections Pro',
      repo: 'example/connections-pro',
      installed_version: '2.0.0',
      version: '2.1.0',
    }),
    create_pro_update({
      plugin_id: 'smart-context',
      name: 'Context Pro',
      repo: 'example/context-pro',
      installed_version: '3.0.0',
      version: '3.1.0',
    }),
  ];
  const env = create_env({
    enabled_plugin_ids: ['smart-connections'],
    runtime_plugin_ids: ['smart-connections'],
    emitted_events,
    lifecycle_calls,
    adapter_operations: operations,
  });

  const updated_plugins = await update_all_installed_entitled_pro_plugins(env, {
    token: 'token',
    ...create_update_check_params(updates),
    ...create_download_params(updates, {
      operations,
    }),
  });

  const first_write_index = operations.findIndex((operation) => operation.startsWith('write:'));
  const last_fetch_index = operations.reduce((last_index, operation, index) => {
    return operation.startsWith('fetch:') ? index : last_index;
  }, -1);
  t.true(first_write_index > last_fetch_index);
  t.deepEqual(
    operations.filter((operation) => operation.startsWith('write:')),
    [
      'write:.obsidian/plugins/smart-connections/main.js',
      'write:.obsidian/plugins/smart-connections/styles.css',
      'write:.obsidian/plugins/smart-connections/manifest.json',
      'write:.obsidian/plugins/smart-context/main.js',
      'write:.obsidian/plugins/smart-context/styles.css',
      'write:.obsidian/plugins/smart-context/manifest.json',
    ],
  );
  t.deepEqual(updated_plugins, [
    { plugin_id: 'smart-connections', version: '2.1.0' },
    { plugin_id: 'smart-context', version: '3.1.0' },
  ]);
  t.deepEqual(lifecycle_calls, []);
  t.true(env.smart_plugins_reload_required);
  t.deepEqual(env.pending_plugin_installs['smart-connections'], {
    item_type: 'pro',
    version: '2.1.0',
  });
  t.deepEqual(env.pending_plugin_installs['smart-context'], {
    item_type: 'pro',
    version: '3.1.0',
  });
  t.is(env.plugin_states['smart-connections'], 'deferred');
  t.is(env.plugin_states['smart-context'], 'deferred');

  const completed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'pro_plugins:update_all_completed';
  });
  t.truthy(completed_event);
  t.is(completed_event.event.level, 'attention');
  t.is(completed_event.event.btn_callback, 'app:reload');
  t.true(completed_event.event.message.includes('2 Pro plugins were updated'));
});

test('update all writes nothing when a downloaded manifest is invalid', async (t) => {
  const operations = [];
  const emitted_events = [];
  const update = create_pro_update({
    plugin_id: 'smart-connections',
    name: 'Connections Pro',
    repo: 'example/connections-pro',
    installed_version: '2.0.0',
    version: '2.1.0',
  });
  const env = create_env({ emitted_events, adapter_operations: operations });

  const result = await update_all_installed_entitled_pro_plugins(env, {
    token: 'token',
    ...create_update_check_params([update]),
    ...create_download_params([update], {
      operations,
      manifest_overrides: {
        'smart-connections': {
          id: 'wrong-plugin-id',
          version: '2.1.0',
        },
      },
    }),
  });

  t.deepEqual(result, []);
  t.false(operations.some((operation) => operation.startsWith('write:')));
  const failed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'pro_plugins:update_all_failed';
  });
  t.is(failed_event.event.failure_state, 'stage_failed');
  t.true(failed_event.event.details.includes('manifest id'));
});

test('update all writes nothing when any required download fails', async (t) => {
  const operations = [];
  const emitted_events = [];
  const update = create_pro_update({
    plugin_id: 'smart-connections',
    name: 'Connections Pro',
    repo: 'example/connections-pro',
    installed_version: '2.0.0',
    version: '2.1.0',
  });
  const env = create_env({ emitted_events, adapter_operations: operations });
  let fetch_count = 0;

  const result = await update_all_installed_entitled_pro_plugins(env, {
    token: 'token',
    ...create_update_check_params([update]),
    async fetch_plugin_file_fn() {
      fetch_count += 1;
      if (fetch_count === 3) throw new Error('styles download failed');
      return {};
    },
    build_plugin_file_record_fn(file_name) {
      return create_file_record(file_name, update);
    },
  });

  t.deepEqual(result, []);
  t.false(operations.some((operation) => operation.startsWith('write:')));
  const failed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'pro_plugins:update_all_failed';
  });
  t.is(failed_event.event.failure_state, 'stage_failed');
});

test('update all aborts when an installed target changes during staging', async (t) => {
  const operations = [];
  const emitted_events = [];
  const update = create_pro_update({
    plugin_id: 'smart-connections',
    name: 'Connections Pro',
    repo: 'example/connections-pro',
    installed_version: '2.0.0',
    version: '2.1.0',
  });
  const env = create_env({ emitted_events, adapter_operations: operations });
  let fetch_count = 0;

  const result = await update_all_installed_entitled_pro_plugins(env, {
    token: 'token',
    ...create_update_check_params([update]),
    ...create_download_params([update], {
      operations,
      on_fetch() {
        fetch_count += 1;
        if (fetch_count === 3) {
          env.obsidian_app.plugins.manifests['smart-connections'].version = '2.0.1';
        }
      },
    }),
  });

  t.deepEqual(result, []);
  t.false(operations.some((operation) => operation.startsWith('write:')));
  const failed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'pro_plugins:update_all_failed';
  });
  t.is(failed_event.event.failure_state, 'stage_failed');
  t.true(failed_event.event.details.includes('changed before the update'));
});

test('write failure restores every plugin file changed by the batch', async (t) => {
  const emitted_events = [];
  const updates = [
    create_pro_update({
      plugin_id: 'smart-connections',
      name: 'Connections Pro',
      repo: 'example/connections-pro',
      installed_version: '2.0.0',
      version: '2.1.0',
    }),
    create_pro_update({
      plugin_id: 'smart-context',
      name: 'Context Pro',
      repo: 'example/context-pro',
      installed_version: '3.0.0',
      version: '3.1.0',
    }),
  ];
  const initial_files = create_initial_plugin_files(updates);
  let failed_once = false;
  const adapter = create_fake_adapter(initial_files, {
    fail_write({ file_path }) {
      if (!failed_once && file_path === '.obsidian/plugins/smart-context/styles.css') {
        failed_once = true;
        return true;
      }
      return false;
    },
  });
  const env = create_env({ emitted_events, adapter });

  const result = await update_all_installed_entitled_pro_plugins(env, {
    token: 'token',
    ...create_update_check_params(updates),
    ...create_download_params(updates),
  });

  t.deepEqual(result, []);
  t.deepEqual(Object.fromEntries(adapter.files), initial_files);
  t.false(Boolean(env.smart_plugins_reload_required));
  t.false(Boolean(env.smart_plugins_recovery_required));
  const failed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'pro_plugins:update_all_failed';
  });
  t.is(failed_event.event.failure_state, 'commit_failed_rolled_back');
  t.true(failed_event.event.rollback_succeeded);
});

test('rollback failure locks later mutations and reports recovery required', async (t) => {
  const emitted_events = [];
  const update = create_pro_update({
    plugin_id: 'smart-connections',
    name: 'Connections Pro',
    repo: 'example/connections-pro',
    installed_version: '2.0.0',
    version: '2.1.0',
  });
  const initial_files = create_initial_plugin_files([update]);
  let commit_failed = false;
  const adapter = create_fake_adapter(initial_files, {
    fail_write({ file_path, text }) {
      if (!commit_failed && file_path.endsWith('/styles.css')) {
        commit_failed = true;
        return true;
      }
      if (
        commit_failed
        && file_path.endsWith('/main.js')
        && text === initial_files[file_path]
      ) {
        return true;
      }
      return false;
    },
  });
  const env = create_env({ emitted_events, adapter });

  const result = await update_all_installed_entitled_pro_plugins(env, {
    token: 'token',
    ...create_update_check_params([update]),
    ...create_download_params([update]),
  });

  t.deepEqual(result, []);
  t.true(env.smart_plugins_recovery_required);
  const failed_event = emitted_events.find(({ event_key }) => {
    return event_key === 'pro_plugins:update_all_failed';
  });
  t.is(failed_event.event.failure_state, 'commit_failed_recovery_required');
  t.false(failed_event.event.rollback_succeeded);
});

test('no-op fresh verification refreshes stale Store state', async (t) => {
  const emitted_events = [];
  const env = create_env({ emitted_events });
  env.smart_plugin_updates = [
    { plugin_id: 'smart-connections', item_type: 'pro' },
    { plugin_id: 'smart-context', item_type: 'core' },
  ];

  const result = await update_all_installed_entitled_pro_plugins(env, {
    token: 'token',
    ...create_update_check_params([]),
  });

  t.deepEqual(result, []);
  t.deepEqual(env.smart_plugin_updates, [
    { plugin_id: 'smart-context', item_type: 'core' },
  ]);
  t.true(emitted_events.some(({ event_key }) => {
    return event_key === 'smart_plugins:store_refresh';
  }));
});

test('build_update_available_message warns about compatibility risk', (t) => {
  const message = build_update_available_message([
    { name: 'Connections Pro' },
    { name: 'Context Pro' },
  ]);

  t.true(message.includes('2 Smart Plugins have updates available'));
  t.true(message.includes('may cause compatibility issues'));
});

function create_env(params = {}) {
  const enabled_plugin_ids = params.enabled_plugin_ids || [];
  const runtime_plugin_ids = params.runtime_plugin_ids || [];
  const emitted_events = params.emitted_events || [];
  const lifecycle_calls = params.lifecycle_calls || [];
  const manifests = params.manifests || {
    'smart-connections': {
      id: 'smart-connections',
      name: 'Connections Pro',
      version: '2.0.0',
    },
    'smart-context': {
      id: 'smart-context',
      name: 'Context Pro',
      version: '3.0.0',
    },
  };
  const initial_files = params.initial_files || create_initial_plugin_files(
    Object.values(manifests).map((manifest) => create_pro_update({
      plugin_id: manifest.id,
      name: manifest.name,
      repo: `example/${manifest.id}-pro`,
      installed_version: manifest.version,
      version: manifest.version,
    }))
  );
  const adapter = params.adapter || create_fake_adapter(initial_files, {
    operations: params.adapter_operations,
  });

  return {
    pending_plugin_installs: {},
    plugin_states: {},
    smart_plugin_updates: [],
    events: {
      emit(event_key, event = {}) {
        emitted_events.push({ event_key, event });
      },
    },
    obsidian_app: {
      vault: {
        configDir: '.obsidian',
        adapter,
        getName() {
          return 'Update Test Vault';
        },
      },
      plugins: {
        manifests,
        enabledPlugins: new Set(enabled_plugin_ids),
        plugins: Object.fromEntries(runtime_plugin_ids.map((plugin_id) => {
          return [plugin_id, {
            unload() {
              lifecycle_calls.push(`unload:${plugin_id}`);
            },
          }];
        })),
        async loadManifests() {
          lifecycle_calls.push('loadManifests');
        },
        async enablePlugin(plugin_id) {
          lifecycle_calls.push(`enablePlugin:${plugin_id}`);
        },
        async disablePlugin(plugin_id) {
          lifecycle_calls.push(`disablePlugin:${plugin_id}`);
        },
      },
    },
  };
}

function create_pro_update(params = {}) {
  return {
    plugin_id: params.plugin_id,
    item_type: 'pro',
    installed_type: 'pro',
    has_core_track: params.has_core_track === true,
    name: params.name,
    repo: params.repo,
    version: params.version,
    requested_version: params.version,
    installed_version: params.installed_version,
    manifest: {
      id: params.plugin_id,
      name: params.name,
      version: params.installed_version,
    },
    plugin: {
      item_type: 'pro',
      plugin_id: params.plugin_id,
      name: params.name,
      repo: params.repo,
      version: params.version,
      entitled: true,
    },
  };
}

function create_update_check_params(updates = [], params = {}) {
  return {
    async fetch_server_plugin_list_fn(token) {
      await params.on_fetch?.({ token });
      if (params.status && params.status !== 200) {
        return {
          list: [],
          status: params.status,
          message: params.message || '',
        };
      }

      return {
        status: 200,
        list: updates.map((update) => ({
          item_type: 'pro',
          plugin_id: update.plugin_id,
          name: update.name,
          repo: update.repo,
          version: update.version,
          entitled: update.plugin?.entitled === true,
          ...(update.has_core_track
            ? { core_repo: `example/${update.plugin_id}-core` }
            : {}),
        })),
      };
    },
  };
}

function create_download_params(updates, params = {}) {
  const updates_by_repo = new Map(updates.map((update) => [update.repo, update]));
  const manifest_overrides = params.manifest_overrides || {};

  return {
    async fetch_plugin_file_fn(repo, token, file_params) {
      params.operations?.push(`fetch:${repo}:${file_params.file}`);
      await params.on_fetch?.({ repo, token, file_params });
      return {
        repo,
        file_name: file_params.file,
      };
    },
    build_plugin_file_record_fn(file_name, response) {
      const update = updates_by_repo.get(response.repo);
      return create_file_record(file_name, update, {
        manifest: manifest_overrides[update.plugin_id],
      });
    },
  };
}

function create_file_record(file_name, update, params = {}) {
  let text = '';
  if (file_name === 'manifest.json') {
    text = JSON.stringify(params.manifest || {
      id: update.plugin_id,
      name: update.name,
      version: update.version,
    });
  } else if (file_name === 'main.js') {
    text = `console.log(${JSON.stringify(`${update.plugin_id} ${update.version}`)});`;
  }

  return {
    fileName: file_name,
    data: new TextEncoder().encode(text),
    accessed_at: 1,
  };
}

function create_initial_plugin_files(updates = []) {
  return Object.fromEntries(updates.flatMap((update) => {
    const base_folder = `.obsidian/plugins/${update.plugin_id}`;
    return [
      [`${base_folder}/main.js`, `old main ${update.plugin_id}`],
      [`${base_folder}/styles.css`, `old styles ${update.plugin_id}`],
      [`${base_folder}/manifest.json`, JSON.stringify({
        id: update.plugin_id,
        name: update.name,
        version: update.installed_version,
      })],
    ];
  }));
}

function create_fake_adapter(initial_files = {}, params = {}) {
  const files = new Map(Object.entries(initial_files));
  const folders = new Set();
  const operations = params.operations || [];

  for (const file_path of files.keys()) {
    folders.add(file_path.split('/').slice(0, -1).join('/'));
  }

  return {
    files,
    async exists(file_path) {
      return files.has(file_path) || folders.has(file_path);
    },
    async mkdir(folder_path) {
      folders.add(folder_path);
      operations.push(`mkdir:${folder_path}`);
    },
    async read(file_path) {
      if (!files.has(file_path)) throw new Error(`Missing file: ${file_path}`);
      return files.get(file_path);
    },
    async stat() {
      return { ctime: 1, mtime: 1 };
    },
    async write(file_path, text) {
      operations.push(`write:${file_path}`);
      if (params.fail_write?.({ file_path, text, files })) {
        throw new Error(`Write failed: ${file_path}`);
      }
      files.set(file_path, text);
      folders.add(file_path.split('/').slice(0, -1).join('/'));
    },
    async remove(file_path) {
      operations.push(`remove:${file_path}`);
      files.delete(file_path);
    },
  };
}
