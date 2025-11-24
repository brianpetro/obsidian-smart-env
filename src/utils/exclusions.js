/**
 * Ensure smart_sources settings object exists and has CSV strings for exclusions.
 * @param {Object} env
 * @returns {Object}
 */
export function ensure_smart_sources_settings(env) {
  if (!env.settings) env.settings = {};
  if (!env.settings.smart_sources) env.settings.smart_sources = {};
  const smart_sources_settings = env.settings.smart_sources;
  if (!smart_sources_settings.folder_exclusions) smart_sources_settings.folder_exclusions = '';
  if (!smart_sources_settings.file_exclusions) smart_sources_settings.file_exclusions = '';
  return smart_sources_settings;
}

/**
 * Normalize a CSV list of exclusions into a trimmed array.
 * @param {string} exclusions
 * @returns {string[]}
 */
export function parse_exclusions_csv(exclusions = '') {
  return exclusions.split(',').map(value => value.trim()).filter(Boolean);
}

/**
 * Append a value to a CSV list when it does not already exist.
 * @param {string} exclusions
 * @param {string} value
 * @returns {string}
 */
export function add_exclusion(exclusions, value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return exclusions || '';
  const current = parse_exclusions_csv(exclusions);
  if (!current.includes(trimmed)) current.push(trimmed);
  return current.join(',');
}

/**
 * Remove a value from a CSV list of exclusions.
 * @param {string} exclusions
 * @param {string} value
 * @returns {string}
 */
export function remove_exclusion(exclusions, value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return exclusions?.trim() || '';
  const filtered = parse_exclusions_csv(exclusions).filter(entry => entry !== trimmed);
  return filtered.join(',');
}
