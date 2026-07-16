import {
  build_plugin_file_record,
  fetch_plugin_file,
  fetch_server_plugin_list,
  get_oauth_storage_prefix,
  install_file_names,
} from './smart_plugins.js';
import {
  default_smart_plugins_list,
  get_plugin_item_type,
  get_plugin_repo,
  hydrate_core_plugin_versions,
  merge_smart_plugins_catalog,
  normalize_release_version,
} from './smart_plugins_catalog.js';
import {
  infer_installed_plugin_type,
  should_offer_plugin_update,
} from './smart_plugins_state.js';
import { compare_versions } from 'smart-environment/utils/compare_versions.js';

const plugin_commit_file_names = ['main.js', 'styles.css', 'manifest.json'];

/**
 * Collect available updates from an installed manifest map and hydrated catalog.
 *
 * @param {object} [params={}]
 * @param {Record<string, object>} [params.installed_manifests={}]
 * @param {Array<object>} [params.catalog=[]]
 * @param {Record<string, object>} [params.pending_plugin_installs={}]
 * @returns {Array<{
 *   plugin_id: string,
 *   item_type: 'core'|'pro',
 *   name: string,
 *   repo: string,
 *   version: string,
 *   requested_version: string,
 *   installed_version: string,
 *   manifest: object,
 *   plugin: object,
 * }>}
 */
export function collect_installed_smart_plugin_updates(params = {}) {
  const installed_manifests = params.installed_manifests || {};
  const pending_plugin_installs = params.pending_plugin_installs || {};
  const catalog = Array.isArray(params.catalog) ? params.catalog : [];
  const plugin_groups = build_plugin_groups(catalog);
  const updates = [];

  Object.values(installed_manifests).forEach((manifest) => {
    const plugin_id = String(manifest?.id || '').trim();
    if (!plugin_id) return;

    const plugin_group = plugin_groups.get(plugin_id);
    if (!plugin_group) return;

    const pending_install = pending_plugin_installs?.[plugin_id] || null;
    const installed_type = resolve_installed_type({
      manifest,
      pending_install,
      plugin_group,
    });
    if (!installed_type) return;

    const plugin = plugin_group[installed_type];
    if (!plugin) return;

    const installed_version = normalize_release_version(
      pending_install?.version || manifest?.version
    );
    const requested_version = String(plugin?.version || '').trim();
    const version = normalize_release_version(requested_version);
    const is_entitled = installed_type === 'pro'
      ? plugin?.entitled === true
      : true
    ;

    if (!should_offer_plugin_update({
      item_type: installed_type,
      installed_type,
      is_entitled,
      server_version: version,
      installed_version,
      compare_versions,
    })) {
      return;
    }

    const repo = get_plugin_repo(plugin);
    if (!repo) return;

    updates.push({
      plugin_id,
      item_type: installed_type,
      installed_type,
      has_core_track: plugin_group.has_core_track === true,
      name: get_plugin_label(plugin, manifest),
      repo,
      version,
      requested_version,
      installed_version,
      manifest,
      plugin,
    });
  });

  return updates.sort((left, right) => {
    return left.name.localeCompare(right.name)
      || left.plugin_id.localeCompare(right.plugin_id)
    ;
  });
}

/**
 * Check installed Smart Plugins for available Core and entitled Pro updates.
 *
 * This function never writes plugin files. It stores the resolved updates on
 * the environment and may emit one aggregate notification with a Store button.
 *
 * @param {import('../../smart_env.js').SmartEnv} env
 * @param {object} [params={}]
 * @param {boolean} [params.notify=true]
 * @param {boolean} [params.force_notice=false]
 * @param {boolean} [params.include_core=true]
 * @param {boolean} [params.include_pro=true]
 * @param {boolean} [params.persist_state=true]
 * @param {boolean} [params.require_authenticated=false]
 * @param {boolean} [params.require_server_catalog=false]
 * @param {string} [params.event_source='smart_plugin_updates.check']
 * @returns {Promise<Array<object>>}
 */
export async function check_for_smart_plugin_updates(env, params = {}) {
  const app = get_app(env);
  if (!app?.plugins?.manifests) return [];

  const event_source = params.event_source || 'smart_plugin_updates.check';
  const fetch_server_plugin_list_fn = params.fetch_server_plugin_list_fn
    || fetch_server_plugin_list
  ;
  const hydrate_core_plugin_versions_fn = params.hydrate_core_plugin_versions_fn
    || hydrate_core_plugin_versions
  ;
  const token = Object.prototype.hasOwnProperty.call(params, 'token')
    ? String(params.token || '').trim()
    : get_smart_plugins_token(app)
  ;
  const has_token = Boolean(token);
  let server_response = null;

  try {
    server_response = await fetch_server_plugin_list_fn(token);
  } catch (error) {
    console.warn('[smart_plugin_updates] Failed to fetch Smart Plugins catalog', error);
    server_response = {
      list: [],
      status: 0,
      message: error?.message || '',
    };
  }

  if (server_response?.status === 401 && has_token) {
    emit_oauth_token_rejected_once(env, {
      event_source,
      message: server_response?.message,
    });

    if (params.require_authenticated === true) {
      const auth_error = new Error('Smart Plugins session expired. Log in again before updating Pro plugins.');
      auth_error.code = 'smart_plugins_unauthorized';
      throw auth_error;
    }

    try {
      const guest_response = await fetch_server_plugin_list_fn('');
      if (guest_response?.status === 200) {
        server_response = guest_response;
      }
    } catch (error) {
      console.warn('[smart_plugin_updates] Failed to fetch guest Smart Plugins catalog', error);
    }
  } else if (server_response?.status === 200) {
    env._smart_plugin_update_token_rejected = false;
  }

  if (params.require_server_catalog === true && server_response?.status !== 200) {
    const catalog_error = new Error(
      server_response?.message
      || 'Unable to verify Smart Plugin updates with the server.'
    );
    catalog_error.code = 'smart_plugins_catalog_unavailable';
    throw catalog_error;
  }

  const server_catalog_available = server_response?.status === 200;
  const catalog = server_catalog_available
    ? merge_smart_plugins_catalog(server_response)
    : default_smart_plugins_list()
  ;
  const installed_plugin_ids = Object.keys(app.plugins.manifests || {});

  if (params.include_core !== false) {
    await hydrate_core_plugin_versions_fn(catalog, {
      plugin_ids: installed_plugin_ids,
      request_url: params.request_url,
    });
  }

  let updates = collect_installed_smart_plugin_updates({
    installed_manifests: app.plugins.manifests,
    pending_plugin_installs: env?.pending_plugin_installs,
    catalog,
  });
  if (params.include_core === false) {
    updates = updates.filter((update) => update.item_type === 'pro');
  }
  if (params.include_pro === false) {
    updates = updates.filter((update) => update.item_type === 'core');
  }

  if (params.persist_state !== false) {
    env.smart_plugin_updates = updates;
    if (!updates.length) {
      env._smart_plugin_update_notice_signature = '';
    }
  }

  if (params.notify !== false && updates.length) {
    emit_update_available_notice(env, updates, {
      event_source,
      force_notice: params.force_notice === true,
    });
  }

  return updates;
}

/**
 * Explicitly update every installed entitled Pro plugin with an available update.
 *
 * All downloads are staged before the first write. This avoids beginning a
 * compatibility-sensitive multi-plugin update when any required download is
 * already known to have failed. Runtime plugin instances are not unloaded.
 * Every updated plugin is marked deferred until Obsidian reloads.
 *
 * @param {import('../../smart_env.js').SmartEnv} env
 * @param {object} [params={}]
 * @param {string} [params.token]
 * @param {string} [params.event_source='smart_plugin_updates.update_all']
 * @returns {Promise<Array<{plugin_id:string, version:string}>>}
 */
export function update_all_installed_entitled_pro_plugins(env, params = {}) {
  if (!env) return Promise.resolve([]);
  if (env._smart_plugin_update_all_promise) {
    return env._smart_plugin_update_all_promise;
  }

  const update_promise = run_update_all_installed_entitled_pro_plugins(env, params);
  env._smart_plugin_update_all_promise = update_promise;
  const clear_update_promise = () => {
    if (env._smart_plugin_update_all_promise === update_promise) {
      env._smart_plugin_update_all_promise = null;
    }
  };
  update_promise.then(clear_update_promise, clear_update_promise);
  return update_promise;
}

async function run_update_all_installed_entitled_pro_plugins(env, params = {}) {
  const app = get_app(env);
  if (!app?.vault?.adapter || !app?.plugins?.manifests) return [];

  const event_source = params.event_source || 'smart_plugin_updates.update_all';
  if (env.smart_plugins_reload_required || env.smart_plugins_recovery_required) {
    emit_update_all_failed(env, {
      event_source,
      failure_state: env.smart_plugins_recovery_required
        ? 'recovery_required'
        : 'reload_required',
      message: env.smart_plugins_recovery_required
        ? 'Plugin recovery is required before more Smart Plugin changes.'
        : 'Reload Obsidian before making more Smart Plugin changes.',
    });
    return [];
  }

  const token = Object.prototype.hasOwnProperty.call(params, 'token')
    ? String(params.token || '').trim()
    : get_smart_plugins_token(app)
  ;

  if (!token) {
    emit_update_all_failed(env, {
      event_source,
      failure_state: 'login_required',
      message: 'Login required to update Pro plugins.',
    });
    return [];
  }

  let resolved_updates;
  try {
    resolved_updates = await check_for_smart_plugin_updates(env, {
      ...params,
      token,
      notify: false,
      include_core: false,
      persist_state: false,
      require_authenticated: true,
      require_server_catalog: true,
      event_source,
    });
  } catch (error) {
    console.warn('[smart_plugin_updates] Failed to verify Pro plugin updates', error);
    emit_update_all_failed(env, {
      event_source,
      failure_state: error?.code === 'smart_plugins_unauthorized'
        ? 'unauthorized'
        : 'verification_failed',
      message: error?.code === 'smart_plugins_unauthorized'
        ? error.message
        : 'Unable to verify Pro plugin entitlements or updates. No files were changed.',
      details: error?.message || '',
    });
    return [];
  }

  const pro_updates = (Array.isArray(resolved_updates) ? resolved_updates : [])
    .filter((update) => {
      return update?.item_type === 'pro'
        && update?.plugin?.entitled === true
        && update?.plugin_id
        && update?.repo
        && update?.version
      ;
    })
  ;

  if (!pro_updates.length) {
    env.smart_plugin_updates = (env.smart_plugin_updates || []).filter((update) => {
      return update?.item_type !== 'pro';
    });
    env._smart_plugin_update_notice_signature = '';
    env?.events?.emit?.('pro_plugins:update_all_completed', {
      level: 'info',
      message: 'Installed entitled Pro plugins are already up to date.',
      updated_plugins: [],
      event_source,
    });
    env?.events?.emit?.('smart_plugins:store_refresh', {
      event_source,
    });
    return [];
  }

  env?.events?.emit?.('pro_plugins:update_all_started', {
    level: 'debug',
    message: `Updating ${pro_updates.length} Pro plugin${pro_updates.length === 1 ? '' : 's'}...`,
    plugin_keys: pro_updates.map((update) => update.plugin_id),
    event_source,
  });

  const fetch_plugin_file_fn = params.fetch_plugin_file_fn || fetch_plugin_file;
  const build_plugin_file_record_fn = params.build_plugin_file_record_fn
    || build_plugin_file_record
  ;
  const staged_updates = [];

  try {
    for (const update of pro_updates) {
      assert_update_target_current(env, app, update);
      const files = [];
      for (const file_name of install_file_names) {
        const response = await fetch_plugin_file_fn(update.repo, token, {
          file: file_name,
          version: update.requested_version || update.version,
        });
        files.push(build_plugin_file_record_fn(file_name, response));
      }
      validate_staged_plugin_update({ update, files });
      staged_updates.push({ update, files });
    }

    for (const update of pro_updates) {
      assert_update_target_current(env, app, update);
    }
  } catch (error) {
    console.error('[smart_plugin_updates] Failed to stage Pro plugin updates', error);
    emit_update_all_failed(env, {
      event_source,
      failure_state: 'stage_failed',
      message: 'Pro plugin updates were not applied because staging or validation failed.',
      details: error?.message || '',
      plugin_keys: pro_updates.map((update) => update.plugin_id),
    });
    return [];
  }

  try {
    await commit_staged_plugin_updates({
      adapter: app.vault.adapter,
      config_dir: app.vault.configDir,
      staged_updates,
    });
  } catch (error) {
    const write_started = error?.write_started !== false;
    const rollback_succeeded = error?.rollback_succeeded !== false;
    console.error('[smart_plugin_updates] Failed while writing Pro plugin updates', error);

    if (write_started && !rollback_succeeded) {
      env.smart_plugins_recovery_required = true;
    }

    emit_update_all_failed(env, {
      event_source,
      failure_state: !write_started
        ? 'commit_preparation_failed'
        : rollback_succeeded
          ? 'commit_failed_rolled_back'
          : 'commit_failed_recovery_required',
      message: !write_started
        ? 'Pro plugin updates were not applied because local file preparation failed.'
        : rollback_succeeded
          ? 'Pro plugin update failed. Previous plugin files were restored.'
          : 'Pro plugin update failed and automatic recovery was incomplete. Review the affected plugin files before reloading Obsidian.',
      details: [
        error?.message,
        error?.rollback_error?.message,
      ].filter(Boolean).join('\n'),
      plugin_keys: pro_updates.map((update) => update.plugin_id),
      rollback_succeeded: write_started ? rollback_succeeded : undefined,
    });
    env?.events?.emit?.('smart_plugins:store_refresh', {
      event_source,
    });
    return [];
  }

  const updated_plugins = pro_updates.map((update) => {
    mark_plugin_update_deferred(env, update);
    return {
      plugin_id: update.plugin_id,
      version: update.version,
    };
  });
  env.smart_plugins_reload_required = true;
  env.smart_plugin_updates = (env.smart_plugin_updates || []).filter((update) => {
    return !updated_plugins.some((updated_plugin) => {
      return updated_plugin.plugin_id === update.plugin_id
        && update.item_type === 'pro'
      ;
    });
  });
  env._smart_plugin_update_notice_signature = '';

  const updated_names = pro_updates.map((update) => update.name || update.plugin_id);
  env?.events?.emit?.('pro_plugins:update_all_completed', {
    level: 'attention',
    message: build_update_completed_message(updated_names),
    btn_text: 'Reload Obsidian',
    btn_callback: 'app:reload',
    plugin_keys: pro_updates.map((update) => update.plugin_id),
    updated_plugins,
    event_source,
  });
  env?.events?.emit?.('smart_plugins:store_refresh', {
    event_source,
  });

  if (typeof params.on_updated === 'function') {
    try {
      await params.on_updated(updated_plugins);
    } catch (error) {
      console.warn('[smart_plugin_updates] Post-update callback failed', error);
    }
  }

  return updated_plugins;
}

/**
 * Validate and commit staged Smart Plugin files as one rollback-safe batch.
 *
 * Every staged plugin is validated before snapshots or writes begin. Files are
 * written with `manifest.json` last. If a write fails, every target is restored
 * to its previous file contents before the error is rethrown.
 *
 * @param {object} params
 * @param {import('obsidian').DataAdapter} params.adapter
 * @param {string} params.config_dir
 * @param {Array<{update:object, files:Array<object>}>} params.staged_updates
 * @returns {Promise<void>}
 */
export async function commit_staged_plugin_updates(params = {}) {
  const adapter = params.adapter;
  const config_dir = String(params.config_dir || '').trim();
  const staged_updates = Array.isArray(params.staged_updates)
    ? params.staged_updates
    : []
  ;
  if (!adapter || !config_dir || !staged_updates.length) {
    throw new Error('Missing staged Smart Plugin update data.');
  }

  let snapshots;
  try {
    staged_updates.forEach(validate_staged_plugin_update);
    snapshots = await snapshot_plugin_files(adapter, config_dir, staged_updates);
  } catch (error) {
    error.write_started = false;
    throw error;
  }

  let write_started = false;
  try {
    for (const staged_update of staged_updates) {
      const plugin_id = staged_update.update.plugin_id;
      const base_folder = `${config_dir}/plugins/${plugin_id}`;
      if (!await adapter.exists(base_folder)) {
        await adapter.mkdir(base_folder);
      }

      for (const file_name of plugin_commit_file_names) {
        const file = staged_update.files.find((candidate) => {
          return candidate?.fileName === file_name;
        });
        const file_path = `${base_folder}/${file_name}`;
        try {
          write_started = true;
          await adapter.write(
            file_path,
            get_plugin_file_record_text(file),
            build_file_write_options(file),
          );
        } catch (error) {
          error.plugin_id = plugin_id;
          error.file_name = file_name;
          throw error;
        }
      }
    }
  } catch (error) {
    error.write_started = write_started;
    try {
      await restore_plugin_file_snapshots(adapter, snapshots);
      error.rollback_succeeded = true;
    } catch (rollback_error) {
      error.rollback_succeeded = false;
      error.rollback_error = rollback_error;
    }
    throw error;
  }
}

function assert_update_target_current(env, app, update) {
  const plugin_id = String(update?.plugin_id || '').trim();
  const manifest = app?.plugins?.manifests?.[plugin_id] || null;
  if (!manifest) {
    throw new Error(`Installed plugin "${plugin_id}" changed before the update could be applied.`);
  }

  const pending_install = env?.pending_plugin_installs?.[plugin_id] || null;
  const pending_item_type = get_plugin_item_type(pending_install);
  const installed_type = pending_item_type
    || (update?.has_core_track
      ? infer_installed_plugin_type({
        plugin_id,
        manifest_name: manifest?.name,
      })
      : 'pro')
  ;
  if (installed_type !== 'pro') {
    throw new Error(`Installed plugin "${plugin_id}" is no longer on the Pro track.`);
  }

  const installed_version = normalize_release_version(
    pending_install?.version || manifest?.version
  );
  if (installed_version !== normalize_release_version(update?.installed_version)) {
    throw new Error(`Installed plugin "${plugin_id}" changed before the update could be applied.`);
  }

  if (!should_offer_plugin_update({
    item_type: 'pro',
    installed_type,
    is_entitled: update?.plugin?.entitled === true,
    server_version: update?.version,
    installed_version,
    compare_versions,
  })) {
    throw new Error(`Installed plugin "${plugin_id}" is no longer eligible for this update.`);
  }
}

function validate_staged_plugin_update(staged_update = {}) {
  const update = staged_update.update || {};
  const files = Array.isArray(staged_update.files)
    ? staged_update.files
    : []
  ;
  const files_by_name = new Map(
    files.map((file) => [file?.fileName, file])
  );

  for (const file_name of install_file_names) {
    if (!files_by_name.has(file_name)) {
      throw new Error(`Missing ${file_name} for "${update.plugin_id || 'plugin'}".`);
    }
  }

  const main_js = get_plugin_file_record_text(files_by_name.get('main.js'));
  if (!main_js.trim()) {
    throw new Error(`Downloaded main.js is empty for "${update.plugin_id || 'plugin'}".`);
  }

  const manifest_text = get_plugin_file_record_text(files_by_name.get('manifest.json'));
  let manifest;
  try {
    manifest = JSON.parse(manifest_text);
  } catch (error) {
    throw new Error(`Downloaded manifest.json is invalid for "${update.plugin_id || 'plugin'}".`);
  }

  if (String(manifest?.id || '').trim() !== String(update?.plugin_id || '').trim()) {
    throw new Error(`Downloaded manifest id does not match "${update.plugin_id || 'plugin'}".`);
  }
  if (
    normalize_release_version(manifest?.version)
    !== normalize_release_version(update?.version)
  ) {
    throw new Error(`Downloaded manifest version does not match v${update?.version || 'unknown'}.`);
  }
}

function get_plugin_file_record_text(file = {}) {
  if (!file?.data || typeof file.data.byteLength !== 'number') {
    throw new Error(`Missing downloaded data for ${file?.fileName || 'plugin file'}.`);
  }
  return new TextDecoder('utf-8').decode(file.data);
}

function build_file_write_options(file = {}) {
  const accessed_at = Number(file?.accessed_at);
  if (!Number.isFinite(accessed_at) || accessed_at <= 0) return undefined;
  return {
    ctime: accessed_at,
    mtime: accessed_at,
  };
}

async function snapshot_plugin_files(adapter, config_dir, staged_updates) {
  const snapshots = [];

  for (const staged_update of staged_updates) {
    const base_folder = `${config_dir}/plugins/${staged_update.update.plugin_id}`;
    for (const file_name of plugin_commit_file_names) {
      const file_path = `${base_folder}/${file_name}`;
      const exists = await adapter.exists(file_path);
      snapshots.push({
        file_path,
        exists,
        text: exists ? await adapter.read(file_path) : '',
        stat: exists && typeof adapter.stat === 'function'
          ? await adapter.stat(file_path)
          : null,
      });
    }
  }

  return snapshots;
}

async function restore_plugin_file_snapshots(adapter, snapshots = []) {
  let first_error = null;

  for (const snapshot of snapshots) {
    try {
      if (snapshot.exists) {
        const write_options = snapshot.stat
          ? {
            ctime: snapshot.stat.ctime,
            mtime: snapshot.stat.mtime,
          }
          : undefined
        ;
        await adapter.write(snapshot.file_path, snapshot.text, write_options);
        continue;
      }

      if (await adapter.exists(snapshot.file_path)) {
        await adapter.remove(snapshot.file_path);
      }
    } catch (error) {
      if (!first_error) first_error = error;
    }
  }

  if (first_error) throw first_error;
}

/**
 * Build the aggregate startup notice copy.
 *
 * @param {Array<object>} updates
 * @returns {string}
 */
export function build_update_available_message(updates = []) {
  const names = updates
    .map((update) => String(update?.name || update?.plugin_id || '').trim())
    .filter(Boolean)
  ;
  const update_count = names.length;
  if (update_count === 1) {
    return `${names[0]} has an update available. Running outdated plugin versions may cause compatibility issues.`;
  }

  return `${update_count} Smart Plugins have updates available: ${format_name_list(names)}. Running outdated plugin versions may cause compatibility issues.`;
}

function build_plugin_groups(catalog = []) {
  const plugin_groups = new Map();

  catalog.forEach((plugin) => {
    const plugin_id = String(plugin?.plugin_id || '').trim();
    const item_type = get_plugin_item_type(plugin);
    if (!plugin_id || !['core', 'pro'].includes(item_type)) return;

    if (!plugin_groups.has(plugin_id)) {
      plugin_groups.set(plugin_id, {
        core: null,
        pro: null,
        has_core_track: false,
      });
    }
    const plugin_group = plugin_groups.get(plugin_id);
    plugin_group[item_type] = plugin;
    if (item_type === 'core' || String(plugin?.core_repo || '').trim()) {
      plugin_group.has_core_track = true;
    }
  });

  return plugin_groups;
}

function resolve_installed_type(params = {}) {
  const pending_item_type = get_plugin_item_type(params.pending_install);
  if (['core', 'pro'].includes(pending_item_type)) return pending_item_type;

  const plugin_group = params.plugin_group || {};
  const has_core_plugin = Boolean(plugin_group.core);
  const has_pro_plugin = Boolean(plugin_group.pro);
  const has_core_track = plugin_group.has_core_track === true || has_core_plugin;

  if (has_pro_plugin && !has_core_track) return 'pro';
  if (has_core_plugin && !has_pro_plugin) return 'core';
  if (!has_core_plugin && !has_pro_plugin) return null;

  return infer_installed_plugin_type({
    plugin_id: params.manifest?.id,
    manifest_name: params.manifest?.name,
  });
}

function get_plugin_label(plugin = {}, manifest = {}) {
  return String(
    plugin?.item_name
    || plugin?.name
    || manifest?.name
    || plugin?.plugin_id
    || manifest?.id
    || 'plugin'
  ).trim();
}

function get_app(env) {
  return env?.obsidian_app
    || env?.plugin?.app
    || env?.main?.app
    || globalThis.app
    || null
  ;
}

function get_smart_plugins_token(app) {
  if (typeof localStorage === 'undefined') return '';
  const oauth_storage_prefix = get_oauth_storage_prefix(app);
  return localStorage.getItem(oauth_storage_prefix + 'token') || '';
}

function emit_oauth_token_rejected_once(env, params = {}) {
  if (env?._smart_plugin_update_token_rejected) return;
  env._smart_plugin_update_token_rejected = true;
  const server_message = String(params.message || '').trim();
  env?.events?.emit?.('pro_plugins:oauth_token_rejected', {
    level: 'warning',
    message: server_message
      ? `Session expired. ${server_message}`
      : 'Session expired. Please log in again.',
    event_source: params.event_source || 'smart_plugin_updates.check',
  });
}

function emit_update_available_notice(env, updates, params = {}) {
  const signature = updates
    .map((update) => `${update.plugin_id}:${update.item_type}:${update.installed_version}:${update.version}`)
    .sort()
    .join('|')
  ;
  if (
    params.force_notice !== true
    && signature
    && env?._smart_plugin_update_notice_signature === signature
  ) {
    return;
  }

  env._smart_plugin_update_notice_signature = signature;
  env?.events?.emit?.('smart_plugins:updates_available', {
    level: 'attention',
    message: build_update_available_message(updates),
    plugin_updates: updates.map((update) => ({
      plugin_id: update.plugin_id,
      item_type: update.item_type,
      installed_version: update.installed_version,
      version: update.version,
    })),
    btn_text: 'Open Plugin Store',
    btn_event_key: 'smart_plugins:browse',
    btn_event_payload: {
      event_source: 'smart_plugins_updates_notice',
    },
    event_source: params.event_source || 'smart_plugin_updates.check',
  });
}

function mark_plugin_update_deferred(env, update) {
  if (!env.pending_plugin_installs) {
    env.pending_plugin_installs = {};
  }
  if (!env.plugin_states) {
    env.plugin_states = {};
  }

  env.pending_plugin_installs[update.plugin_id] = {
    item_type: 'pro',
    version: update.version,
  };
  env.plugin_states[update.plugin_id] = 'deferred';
}

function emit_update_all_failed(env, params = {}) {
  env?.events?.emit?.('pro_plugins:update_all_failed', {
    level: params.failure_state === 'commit_failed_recovery_required'
      ? 'error'
      : 'warning',
    message: params.message || 'Failed to update Pro plugins.',
    details: params.details || '',
    plugin_keys: params.plugin_keys || [],
    failure_state: params.failure_state || 'failed',
    rollback_succeeded: params.rollback_succeeded,
    event_source: params.event_source || 'smart_plugin_updates.update_all',
  });
}

function build_update_completed_message(updated_names) {
  const count = updated_names.length;
  const names = format_name_list(updated_names);
  const updated_copy = count === 1
    ? `${names} was updated.`
    : `${count} Pro plugins were updated: ${names}.`
  ;
  return `${updated_copy} Reload Obsidian to activate the new versions.`;
}

function format_name_list(names = []) {
  if (names.length <= 1) return names[0] || 'Pro plugin';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

