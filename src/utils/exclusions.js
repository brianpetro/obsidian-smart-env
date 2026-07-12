import { normalize_exclusion_list } from 'smart-sources/utils/exclusions.js';

/**
 * Ensure Smart Sources settings exist and normalize legacy exclusion strings
 * to the canonical array representation used by all new writes.
 *
 * @param {Object} env
 * @returns {Object}
 */
export function ensure_smart_sources_settings(env) {
  if (!env.settings) env.settings = {};
  if (!env.settings.smart_sources) env.settings.smart_sources = {};
  const smart_sources_settings = env.settings.smart_sources;
  smart_sources_settings.folder_exclusions = normalize_exclusion_list(
    smart_sources_settings.folder_exclusions,
  );
  smart_sources_settings.file_exclusions = normalize_exclusion_list(
    smart_sources_settings.file_exclusions,
  );
  return smart_sources_settings;
}

/**
 * Append one exclusion and return the canonical array value.
 *
 * @param {string|string[]} exclusions
 * @param {string} value
 * @returns {string[]}
 */
export function add_exclusion(exclusions, value) {
  const current = normalize_exclusion_list(exclusions);
  const trimmed = value.trim();
  if (!trimmed || /^[/*\\]+$/.test(trimmed)) return current;
  if (!current.includes(trimmed)) current.push(trimmed);
  return current;
}

/**
 * Format a selected folder path as a recursive exclusion pattern.
 *
 * @param {string} folder_path
 * @returns {string}
 */
export function format_folder_exclusion(folder_path) {
  const trimmed = (folder_path ?? '').trim().replace(/\/+$/g, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/**')) return trimmed;
  return `${trimmed}/**`;
}

/**
 * Remove one exclusion and return the canonical array value.
 *
 * @param {string|string[]} exclusions
 * @param {string} value
 * @returns {string[]}
 */
export function remove_exclusion(exclusions, value) {
  const trimmed = value.trim();
  return normalize_exclusion_list(exclusions).filter((entry) => entry !== trimmed);
}
