/**
 * Ensure a settings config is evaluated when provided as a function.
 * @param {object|function} settings_config - The configuration or function to evaluate.
 * @param {object} scope - The scope containing settings.
 * @return {object} Settings config object.
 */
export function ensure_settings_config(settings_config, scope) {
  try {
    if (typeof settings_config === 'function') {
      settings_config = settings_config(scope);
    }
  } catch (e) {
    console.error('Error evaluating settings_config function:', e);
    settings_config = { error: { name: 'Error', description: `Failed to load settings. ${e.message} (logged to console)` } };
  }
  return settings_config;
}

/**
 * Build a map of grouped settings configs.
 * @param {object|function} settings_config - The configuration or function to evaluate.
 * @param {object} scope - The scope containing settings.
 * @param {string} default_group_name - The default group name.
 * @return {object} Group map keyed by group name.
 */
export function build_settings_group_map(settings_config, scope, default_group_name) {
  const resolved_settings_config = ensure_settings_config(settings_config, scope);
  return Object.entries(resolved_settings_config || {})
    .reduce((acc, [key, config]) => {
      const group = config.group || default_group_name;
      if (!acc[group]) acc[group] = {};
      acc[group][key] = config;
      return acc;
    }, { [default_group_name]: {} });
}

/**
 * Resolve the settings config for a single group.
 * @param {object|function} settings_config - The configuration or function to evaluate.
 * @param {object} scope - The scope containing settings.
 * @param {string} group_name - The name of the settings group.
 * @param {string} default_group_name - The default group name.
 * @return {object} Group config object.
 */
export function resolve_group_settings_config(settings_config, scope, group_name, default_group_name) {
  const group_map = build_settings_group_map(settings_config, scope, default_group_name);
  return group_map[group_name] || {};
}
