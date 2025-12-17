/**
 * Builds a fresh copy of default settings merged with auto exclusions.
 * @param {Object} env - Environment instance providing config and fs data.
 * @param {Object} [params={}] - Optional overrides.
 * @param {Object} [params.default_settings] - Defaults to use instead of env.config.default_settings.
 * @param {string[]} [params.auto_exclusions] - Values to merge into smart_sources.file_exclusions.
 * @returns {Object} cloned settings with merged exclusions.
 */
export function build_reset_settings(env, params = {}) {
  const default_settings = clone_defaults(params.default_settings ?? env?.config?.default_settings ?? {});
  const smart_sources_settings = default_settings.smart_sources || (default_settings.smart_sources = {});
  const auto_exclusions = Array.isArray(params.auto_exclusions)
    ? params.auto_exclusions
    : env?.fs?.auto_excluded_files || []
  ;
  smart_sources_settings.file_exclusions = merge_file_exclusions(
    smart_sources_settings.file_exclusions,
    auto_exclusions,
  );
  return default_settings;
}

/**
 * Resets environment settings to defaults and persists them.
 * @param {Object} env - Environment instance to reset.
 * @param {Object} [params={}] - Optional overrides.
 * @param {Object} [params.default_settings] - Defaults to use instead of env.config.default_settings.
 * @param {string[]} [params.auto_exclusions] - Values to merge into smart_sources.file_exclusions.
 * @returns {Promise<Object>} resolved settings after reset.
 */
export async function reset_env_settings(env, params = {}) {
  const settings = build_reset_settings(env, params);
  if (env.smart_settings) {
    env.smart_settings.settings = settings;
  } else {
    env.settings = settings;
  }
  if (typeof env.smart_settings?.save === 'function') {
    await env.smart_settings.save(settings);
  } else if (typeof env.save_settings === 'function') {
    await env.save_settings(settings);
  }
  env.events?.emit?.('settings:reset', { settings });
  return env.settings || settings;
}

function clone_defaults(defaults) {
  return JSON.parse(JSON.stringify(defaults));
}

function merge_file_exclusions(existing_exclusions = '', auto_exclusions = []) {
  const existing = parse_csv(existing_exclusions);
  const merged = [];
  for (const value of [...existing, ...auto_exclusions]) {
    const trimmed_value = typeof value === 'string' ? value.trim() : value;
    if (!trimmed_value || merged.includes(trimmed_value)) continue;
    merged.push(trimmed_value);
  }
  return merged.join(',');
}

function parse_csv(value = '') {
  return String(value)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  ;
}
