import {
  get_event_level,
  normalize_event_level,
  notification_levels,
} from 'smart-events/event_level_utils.js';

export const default_page_size = 100;
export const load_more_step = 100;
export const all_levels_filter_key = 'all';

export { notification_levels };

/**
 * @returns {Set<string>}
 */
export function create_all_levels_set() {
  return new Set(notification_levels);
}

/**
 * @param {Set<string>} [active_levels]
 * @returns {boolean}
 */
export function are_all_levels_active(active_levels = new Set()) {
  if (!(active_levels instanceof Set)) return false;
  if (active_levels.size !== notification_levels.length) return false;
  return notification_levels.every((level) => active_levels.has(level));
}

/**
 * Resolve the next active level set for the feed filter controls.
 *
 * Semantics:
 * - selecting "all" restores every level
 * - clicking a level while "all" is active narrows to that one level
 * - otherwise level clicks toggle membership
 *
 * @param {Set<string>} [active_levels]
 * @param {object} [params={}]
 * @param {string|null} [params.level=null]
 * @param {boolean} [params.select_all=false]
 * @returns {Set<string>}
 */
export function get_next_active_levels(active_levels = new Set(), params = {}) {
  const {
    level = null,
    select_all = false,
  } = params;

  if (select_all) return create_all_levels_set();

  const normalized_level = normalize_event_level(level);
  const next_active_levels = new Set(active_levels instanceof Set ? active_levels : []);

  if (!normalized_level) return next_active_levels;
  if (are_all_levels_active(next_active_levels)) {
    return new Set([normalized_level]);
  }

  if (next_active_levels.has(normalized_level)) {
    next_active_levels.delete(normalized_level);
  } else {
    next_active_levels.add(normalized_level);
  }

  return next_active_levels;
}

/**
 * @param {object} entry
 * @returns {'milestone'|'attention'|'error'|'warning'|'info'|null}
 */
export function get_canonical_entry_level(entry) {
  return get_event_level(entry?.event_key, entry?.event);
}

/**
 * @param {object} entry
 * @returns {'milestone'|'attention'|'error'|'warning'|'info'|null}
 */
export function get_entry_level(entry) {
  const canonical_level = get_canonical_entry_level(entry);
  if (canonical_level) return canonical_level;

  return get_event_level(entry?.event_key, entry?.event, {
    allow_display_fallback: true,
  });
}

/**
 * @param {object} entry
 * @returns {boolean}
 */
export function is_canonical_notification_entry(entry) {
  return Boolean(get_canonical_entry_level(entry));
}

/**
 * @param {object} entry
 * @returns {boolean}
 */
export function is_feed_entry(entry) {
  return Boolean(get_entry_level(entry));
}

/**
 * @param {Array} entries
 * @param {object} [params={}]
 * @param {Set<string>} [params.active_levels]
 * @returns {Array}
 */
export function get_filtered_entries(entries, params = {}) {
  const { active_levels = create_all_levels_set() } = params;
  if (!(active_levels instanceof Set) || active_levels.size === 0) return [];

  if (are_all_levels_active(active_levels)) {
    return Array.isArray(entries) ? [...entries] : [];
  }

  return entries.filter((entry) => {
    const level = get_entry_level(entry);
    if (!level) return false;
    return active_levels.has(level);
  });
}

/**
 * @param {Array} entries
 * @param {object} [params={}]
 * @param {number} [params.limit]
 * @returns {Array}
 */
export function get_visible_entries(entries, params = {}) {
  const { limit = default_page_size } = params;
  return entries.slice(-limit).reverse();
}

/**
 * @param {number} entries_length
 * @param {object} [params={}]
 * @param {number} [params.page_size]
 * @returns {number}
 */
export function get_visible_count(entries_length, params = {}) {
  const { page_size = default_page_size } = params;
  return Math.min(entries_length, page_size);
}

/**
 * @param {number} entries_length
 * @param {object} [params={}]
 * @param {number} [params.current_count]
 * @param {number} [params.step_size]
 * @returns {number}
 */
export function get_next_visible_count(entries_length, params = {}) {
  const { current_count = 0, step_size = load_more_step } = params;
  return Math.min(entries_length, current_count + step_size);
}

/**
 * @param {number} entries_length
 * @param {number} visible_count
 * @returns {boolean}
 */
export function should_show_load_more(entries_length, visible_count) {
  return entries_length > visible_count;
}

/**
 * @param {string|null} level
 * @returns {string}
 */
export function format_level_label(level) {
  const value = typeof level === 'string' ? level : '';
  if (!value) return '';
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

/**
 * @param {Array} entries
 * @returns {Record<string, number>}
 */
export function get_level_counts(entries) {
  const counts = notification_levels.reduce((acc, level) => {
    acc[level] = 0;
    return acc;
  }, {});

  entries.forEach((entry) => {
    const level = get_entry_level(entry);
    if (!level) return;
    counts[level] += 1;
  });

  return counts;
}

/**
 * @param {object} entry
 * @returns {number}
 */
export function get_entry_timestamp(entry) {
  if (typeof entry?.event?.at === 'number') return entry.event.at;
  if (typeof entry?.at === 'number') return entry.at;
  return Date.now();
}

/**
 * @param {object} entry
 * @returns {string}
 */
export function get_entry_event_key(entry) {
  return typeof entry?.event_key === 'string' ? entry.event_key : '';
}

/**
 * @param {object} entry
 * @returns {string}
 */
export function get_entry_title(entry) {
  const event_obj = entry?.event && typeof entry.event === 'object' ? entry.event : {};
  if (typeof event_obj.message === 'string' && event_obj.message.trim()) return event_obj.message.trim();
  if (typeof event_obj.details === 'string' && event_obj.details.trim()) return event_obj.details.trim();
  if (typeof event_obj.milestone === 'string' && event_obj.milestone.trim()) return event_obj.milestone.trim();
  return get_entry_event_key(entry) || 'event';
}

/**
 * @param {object} entry
 * @returns {string}
 */
export function get_entry_payload_text(entry) {
  const event_obj = entry?.event && typeof entry.event === 'object' ? entry.event : {};

  return Object.entries(event_obj)
    .filter(([key]) => !['at', 'collection_key', 'message', 'level', 'btn_text', 'btn_callback'].includes(key))
    .map(([key, value]) => `  ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('\n');
}

/**
 * @param {object} entry
 * @returns {string}
 */
export function get_entry_meta_text(entry) {
  const collection_key = entry?.event?.collection_key ?? '';
  const event_key = get_entry_event_key(entry) || 'event';
  const timestamp = get_entry_timestamp(entry);

  return `${collection_key ? `${collection_key} - ` : ''}${event_key} - ${to_time_ago(timestamp)}`;
}

/**
 * @param {object} entry
 * @returns {string}
 */
export function entry_to_clipboard_text(entry) {
  const meta_text = get_entry_meta_text(entry);
  const payload_text = get_entry_payload_text(entry);

  if (!payload_text.trim().length) {
    return `${meta_text}\n\n`;
  }

  return `${meta_text}\n${payload_text}\n\n`;
}

/**
 * @param {Array} entries
 * @returns {string}
 */
export function entries_to_clipboard_text(entries = []) {
  return entries.map((entry) => entry_to_clipboard_text(entry)).join('');
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function to_time_ago(ms) {
  const now_ms = Date.now();
  const seconds = Math.floor((now_ms - ms) / 1000);

  if (seconds < 60) return `${Math.max(0, seconds)}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
