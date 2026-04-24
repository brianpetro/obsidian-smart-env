export const pro_plugin_ids_without_pro_in_name = new Set(['smart-file-nav']);

/**
 * Infer whether an installed manifest is the Core or Pro track.
 *
 * @param {object} [params={}]
 * @param {string} [params.plugin_id]
 * @param {string} [params.manifest_name]
 * @returns {'core'|'pro'}
 */
export function infer_installed_plugin_type(params = {}) {
  const plugin_id = String(params.plugin_id || '').trim();
  if (pro_plugin_ids_without_pro_in_name.has(plugin_id)) {
    return 'pro';
  }

  const manifest_name = String(params.manifest_name || '');
  return manifest_name.includes('Pro')
    ? 'pro'
    : 'core'
  ;
}

/**
 * Return true when a Pro install/update action should be blocked by entitlement.
 *
 * @param {object} [params={}]
 * @param {string|null} [params.item_type]
 * @param {boolean} [params.is_entitled]
 * @returns {boolean}
 */
export function should_block_pro_install(params = {}) {
  return String(params.item_type || '').trim() === 'pro'
    && params.is_entitled !== true
  ;
}

/**
 * Determine whether a Plugin Store row should show `Update`.
 *
 * Rules:
 * - row type must match installed type
 * - Pro rows must be currently entitled
 * - compare server vs installed version only
 *
 * @param {object} [params={}]
 * @param {string|null} [params.item_type]
 * @param {string|null} [params.installed_type]
 * @param {boolean} [params.is_entitled]
 * @param {string|null} [params.server_version]
 * @param {string|null} [params.installed_version]
 * @param {(left: string, right: string) => number} [params.compare_versions]
 * @returns {boolean}
 */
export function should_offer_plugin_update(params = {}) {
  const item_type = String(params.item_type || '').trim();
  const installed_type = String(params.installed_type || '').trim();

  if (!item_type || item_type !== installed_type) {
    return false;
  }

  if (should_block_pro_install({
    item_type,
    is_entitled: params.is_entitled,
  })) {
    return false;
  }

  const server_version = String(params.server_version || '').trim();
  const installed_version = String(params.installed_version || '').trim();
  if (!server_version || !installed_version) {
    return false;
  }

  if (typeof params.compare_versions !== 'function') {
    return false;
  }

  return params.compare_versions(server_version, installed_version) > 0;
}

/**
 * Determine whether an installed row should surface an outdated Smart Environment
 * compatibility signal separate from true update availability.
 *
 * Rules:
 * - row type must match installed type
 * - Pro rows must still be entitled
 * - only applies when enabled, not loaded, and not already deferred
 * - only applies when the currently loaded SmartEnv is outdated (< 2.4)
 *
 * @param {object} [params={}]
 * @param {string|null} [params.item_type]
 * @param {string|null} [params.installed_type]
 * @param {boolean} [params.is_entitled]
 * @param {boolean} [params.is_enabled]
 * @param {boolean} [params.is_loaded]
 * @param {boolean} [params.is_deferred]
 * @param {string|null} [params.loaded_env_version]
 * @returns {boolean}
 */
export function should_signal_outdated_env_compatibility(params = {}) {
  const item_type = String(params.item_type || '').trim();
  const installed_type = String(params.installed_type || '').trim();

  if (!item_type || item_type !== installed_type) {
    return false;
  }

  if (should_block_pro_install({
    item_type,
    is_entitled: params.is_entitled,
  })) {
    return false;
  }

  if (params.is_enabled !== true) {
    return false;
  }

  if (params.is_loaded === true || params.is_deferred === true) {
    return false;
  }

  return has_outdated_smart_env_version(params.loaded_env_version);
}



/**
 * Resolve the control state for one plugin track inside a PluginListItem.
 *
 * This is the pure state engine behind `PluginListItem.computed_state`.
 * It intentionally excludes UI control specs so tests can cover the state
 * matrix without importing the UI module.
 *
 * @param {object} [params={}]
 * @param {'core'|'pro'} [params.item_type]
 * @param {boolean} [params.has_core_plugin]
 * @param {boolean} [params.has_pro_plugin]
 * @param {string|null} [params.installed_type]
 * @param {boolean} [params.is_entitled]
 * @param {boolean} [params.should_update]
 * @param {boolean} [params.has_outdated_env_compatibility]
 * @param {boolean} [params.is_deferred]
 * @param {boolean} [params.is_loaded]
 * @param {boolean} [params.is_enabled]
 * @returns {{item_type: 'core'|'pro', is_installed_here: boolean, control_state: string}|null}
 */
export function compute_plugin_track_state(params = {}) {
  const item_type = String(params.item_type || '').trim();
  const has_core_plugin = params.has_core_plugin === true;
  const has_pro_plugin = params.has_pro_plugin === true;
  const has_group_ui = has_core_plugin && has_pro_plugin;
  const installed_type = String(params.installed_type || '').trim();

  if (item_type !== 'core' && item_type !== 'pro') {
    return null;
  }

  if ((item_type === 'core' && !has_core_plugin) || (item_type === 'pro' && !has_pro_plugin)) {
    return null;
  }

  let control_state = 'cant_install';

  if (installed_type === item_type) {
    if (params.should_update === true) {
      control_state = 'update_available';
    } else if (params.has_outdated_env_compatibility === true) {
      control_state = 'outdated_env';
    } else if (params.is_deferred === true) {
      control_state = 'deferred';
    } else if (params.is_loaded === true) {
      control_state = 'loaded';
    } else if (params.is_enabled !== true) {
      control_state = 'can_enable';
    } else {
      control_state = 'installed';
    }
  } else if (item_type === 'core') {
    if (has_group_ui && (installed_type === 'pro' || params.is_entitled === true)) {
      control_state = 'included_in_pro';
    } else if (has_group_ui) {
      control_state = 'can_install_core_only';
    } else {
      control_state = 'can_install';
    }
  } else if (item_type === 'pro') {
    if (installed_type === 'core') {
      control_state = 'core_installed';
    } else if (params.is_entitled === true) {
      control_state = 'can_install_pro';
    } else {
      control_state = 'cant_install';
    }
  }

  return {
    item_type,
    is_installed_here: installed_type === item_type,
    control_state,
  };
}

/**
 * Compute the resolved row + per-track states for a plugin store item.
 *
 * @param {object} [params={}]
 * @param {boolean} [params.has_core_plugin]
 * @param {boolean} [params.has_pro_plugin]
 * @param {string|null} [params.display_item_type]
 * @param {string|null} [params.installed_type]
 * @param {boolean} [params.is_entitled]
 * @param {boolean} [params.should_update]
 * @param {boolean} [params.has_outdated_env_compatibility]
 * @param {boolean} [params.is_deferred]
 * @param {boolean} [params.is_loaded]
 * @param {boolean} [params.is_enabled]
 * @returns {{
 *   row: {item_type: 'core'|'pro', is_installed_here: boolean, control_state: string}|null,
 *   track_states: {
 *     core: {item_type: 'core', is_installed_here: boolean, control_state: string}|null,
 *     pro: {item_type: 'pro', is_installed_here: boolean, control_state: string}|null,
 *   },
 * }}
 */
export function compute_plugin_list_item_state(params = {}) {
  const has_core_plugin = params.has_core_plugin === true;
  const has_pro_plugin = params.has_pro_plugin === true;
  const has_group_ui = has_core_plugin && has_pro_plugin;
  const installed_type = String(params.installed_type || '').trim();
  const display_item_type = String(params.display_item_type || '').trim()
    || (has_pro_plugin ? 'pro' : 'core')
  ;

  const track_states = {
    core: compute_plugin_track_state({
      ...params,
      has_core_plugin,
      has_pro_plugin,
      installed_type,
      item_type: 'core',
    }),
    pro: compute_plugin_track_state({
      ...params,
      has_core_plugin,
      has_pro_plugin,
      installed_type,
      item_type: 'pro',
    }),
  };

  let row = null;

  if (has_group_ui) {
    row = ['core', 'pro'].includes(installed_type)
      ? track_states[installed_type]
      : (params.is_entitled === true ? track_states.pro : track_states.core)
    ;
  } else {
    row = track_states[display_item_type] || null;
  }

  return {
    row,
    track_states,
  };
}

/**
 * Resolve enable/disable behavior for install/update flows.
 *
 * New installs should enable the plugin.
 * Updates should only re-enable when the plugin was enabled beforehand.
 *
 * @param {object} [params={}]
 * @param {boolean} [params.was_installed]
 * @param {boolean} [params.was_enabled]
 * @returns {{
 *   should_disable_before_install: boolean,
 *   should_enable_after_install: boolean,
 * }}
 */
export function get_install_enable_behavior(params = {}) {
  const was_installed = params.was_installed === true;
  const was_enabled = params.was_enabled === true;

  return {
    should_disable_before_install: was_installed && was_enabled,
    should_enable_after_install: !was_installed || was_enabled,
  };
}

export function has_outdated_smart_env_version(version = '') {
  const version_pcs = String(version || '').trim().split('.');
  const version_minor = Number.parseInt(version_pcs[1] || '0', 10);
  if (!Number.isFinite(version_minor)) {
    return false;
  }
  return version_minor < 4;
}
