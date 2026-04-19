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
 * - if the loaded SmartEnv is outdated (< 2.4), keep showing Update for an
 *   enabled installed row even before comparing server semver
 * - otherwise compare server vs installed version
 *
 * @param {object} [params={}]
 * @param {string|null} [params.item_type]
 * @param {string|null} [params.installed_type]
 * @param {boolean} [params.is_entitled]
 * @param {boolean} [params.is_enabled]
 * @param {boolean} [params.is_loaded]
 * @param {boolean} [params.is_deferred]
 * @param {string|null} [params.loaded_env_version]
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

  if (
    params.is_enabled === true
    && params.is_loaded !== true
    && params.is_deferred !== true
    && has_outdated_smart_env_version(params.loaded_env_version)
  ) {
    return true;
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

function has_outdated_smart_env_version(version = '') {
  const version_pcs = String(version || '').trim().split('.');
  const version_minor = Number.parseInt(version_pcs[1] || '0', 10);
  if (!Number.isFinite(version_minor)) {
    return false;
  }
  return version_minor < 4;
}
