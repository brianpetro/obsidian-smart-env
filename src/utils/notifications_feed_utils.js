import {
  get_event_level,
  normalize_event_level,
  notification_levels,
} from 'smart-events/event_level_utils.js';

export const default_page_size = 100;
export const load_more_step = 100;
export const all_levels_filter_key = 'all';
export const debug_levels_filter_key = 'debug';
export const max_payload_depth = 4;
export const max_payload_output_length = 4000;
export const notification_filter_keys = Object.freeze([
  ...notification_levels,
  debug_levels_filter_key,
]);

const payload_truncation_marker = '[Truncated]';
const payload_depth_marker = '[MaxDepth]';
const omitted_payload_keys = new Set([
  'at',
  'collection_key',
  'message',
  'level',
  'btn_text',
  'btn_callback',
  'timeout',
  'timeout_ms',
  'link',
  'help_link',
  'hide_mute_button',
]);

export { notification_levels };

/**
 * @param {unknown} level
 * @returns {'milestone'|'attention'|'error'|'warning'|'info'|'debug'|null}
 */
function normalize_filter_level(level) {
  const normalized_level = normalize_event_level(level);
  if (normalized_level) return normalized_level;

  const raw_level = typeof level === 'string'
    ? level.trim().toLowerCase()
    : ''
  ;
  if (raw_level === debug_levels_filter_key) return debug_levels_filter_key;

  return null;
}

/**
 * @returns {Set<string>}
 */
export function create_all_levels_set() {
  return new Set(notification_filter_keys);
}

/**
 * @param {Set<string>} [active_levels]
 * @returns {boolean}
 */
export function are_all_levels_active(active_levels = new Set()) {
  if (!(active_levels instanceof Set)) return false;
  if (active_levels.size !== notification_filter_keys.length) return false;
  return notification_filter_keys.every((level) => active_levels.has(level));
}

/**
 * Resolve the next active level set for the feed filter controls.
 *
 * Semantics:
 * - selecting "all" restores every level plus debug entries
 * - clicking a level while "all" is active narrows to that one token
 * - otherwise token clicks toggle membership
 * - a zero-selection state is invalid; toggling off the final active token
 *   restores "all"
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

  const normalized_level = normalize_filter_level(level);
  const next_active_levels = new Set(active_levels instanceof Set ? active_levels : []);

  if (!normalized_level) return next_active_levels;
  if (are_all_levels_active(next_active_levels)) {
    return new Set([normalized_level]);
  }

  if (next_active_levels.has(normalized_level)) {
    next_active_levels.delete(normalized_level);
    if (next_active_levels.size === 0) {
      return create_all_levels_set();
    }
    return next_active_levels;
  }

  next_active_levels.add(normalized_level);
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
 * Debug rows are session events without any canonical or display fallback level.
 *
 * @param {object} entry
 * @returns {boolean}
 */
export function is_debug_entry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return !get_entry_level(entry);
}

/**
 * @param {object} entry
 * @returns {boolean}
 */
export function is_feed_entry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return Boolean(get_entry_level(entry)) || is_debug_entry(entry);
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

  const next_entries = Array.isArray(entries) ? [...entries] : [];
  if (are_all_levels_active(active_levels)) {
    return next_entries;
  }

  return next_entries.filter((entry) => {
    const level = get_entry_level(entry);
    if (level) return active_levels.has(level);
    return active_levels.has(debug_levels_filter_key);
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
  const normalized_level = normalize_filter_level(level);
  if (!normalized_level) return '';
  return normalized_level.slice(0, 1).toUpperCase() + normalized_level.slice(1);
}

/**
 * @param {Array} entries
 * @returns {Record<string, number>}
 */


/**
 * @param {Array} pending_entries
 * @param {Array} next_entries
 * @param {object} [params={}]
 * @param {Array} [params.existing_entries]
 * @returns {Array}
 */
export function queue_live_update_entries(pending_entries, next_entries, params = {}) {
  const { existing_entries = [] } = params;

  const pending_list = Array.isArray(pending_entries)
    ? [...pending_entries]
    : []
  ;
  const pending_entry_ids = new Set(pending_list.map((entry) => `${get_entry_event_key(entry)}::${get_entry_timestamp(entry)}`));
  const existing_entry_ids = new Set((Array.isArray(existing_entries) ? existing_entries : []).map((entry) => `${get_entry_event_key(entry)}::${get_entry_timestamp(entry)}`));

  (Array.isArray(next_entries) ? next_entries : []).forEach((entry) => {
    const entry_id = `${get_entry_event_key(entry)}::${get_entry_timestamp(entry)}`;
    if (existing_entry_ids.has(entry_id)) return;
    if (pending_entry_ids.has(entry_id)) return;
    pending_list.push(entry);
    pending_entry_ids.add(entry_id);
  });

  return pending_list;
}

/**
 * @param {Array} pending_entries
 * @returns {Array}
 */
export function consume_live_update_entries(pending_entries) {
  return get_visible_entries(Array.isArray(pending_entries) ? pending_entries : [], {
    limit: Array.isArray(pending_entries) ? pending_entries.length : 0,
  });
}

export function get_level_counts(entries) {
  const counts = notification_filter_keys.reduce((acc, level) => {
    acc[level] = 0;
    return acc;
  }, {});

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const level = get_entry_level(entry);
    if (level) {
      counts[level] += 1;
      return;
    }
    counts[debug_levels_filter_key] += 1;
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
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function normalize_payload_limit(value, fallback) {
  const normalized_value = Number(value);
  if (!Number.isFinite(normalized_value) || normalized_value <= 0) return fallback;
  return Math.floor(normalized_value);
}

/**
 * @param {string} text
 * @param {number} max_length
 * @returns {{ text: string, truncated: boolean }}
 */
function truncate_payload_text(text, max_length) {
  const normalized_max_length = Math.max(0, Math.floor(max_length));
  if (text.length <= normalized_max_length) {
    return { text, truncated: false };
  }
  if (normalized_max_length <= payload_truncation_marker.length) {
    return {
      text: payload_truncation_marker.slice(0, normalized_max_length),
      truncated: true,
    };
  }

  return {
    text: `${text.slice(0, normalized_max_length - payload_truncation_marker.length)}${payload_truncation_marker}`,
    truncated: true,
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function get_payload_constructor_name(value) {
  try {
    const constructor_name = value?.constructor?.name;
    return typeof constructor_name === 'string' ? constructor_name : '';
  } catch {
    return '';
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function is_plain_payload_object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null) return true;
    return Object.prototype.hasOwnProperty.call(prototype, 'constructor')
      && prototype.constructor?.name === 'Object'
    ;
  } catch {
    return false;
  }
}

/**
 * Summarize runtime objects instead of traversing application or DOM graphs.
 *
 * @param {unknown} value
 * @returns {string}
 */
function get_payload_object_descriptor(value) {
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value) || is_plain_payload_object(value)) return '';

  const constructor_name = get_payload_constructor_name(value);
  if (constructor_name === 'Date') return '';

  if (constructor_name.endsWith('Error')) {
    try {
      if (typeof value.message === 'string' && value.message.trim()) {
        return `[${constructor_name}: ${value.message.trim()}]`;
      }
    } catch {
      // Fall through to the constructor-only descriptor.
    }
  }

  return `[${constructor_name || 'Object'}]`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function get_payload_value_fallback_text(value) {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') {
    return `[Function${value.name ? ` ${value.name}` : ''}]`;
  }
  if (typeof value === 'symbol') return String(value);
  if (typeof value === 'object') {
    return `[Unserializable ${get_payload_constructor_name(value) || 'Object'}]`;
  }
  return String(value);
}

/**
 * @param {object} state
 * @param {number} length
 * @returns {boolean}
 */
function consume_payload_budget(state, length) {
  const normalized_length = Math.max(1, Math.ceil(Number(length) || 0));
  if (state.remaining_length < normalized_length) {
    state.remaining_length = 0;
    state.truncated = true;
    return false;
  }

  state.remaining_length -= normalized_length;
  return true;
}

/**
 * @param {string} value
 * @param {object} state
 * @returns {string}
 */
function get_bounded_payload_string(value, state) {
  const available_length = Math.max(0, state.remaining_length - 2);
  if (value.length <= available_length) {
    consume_payload_budget(state, value.length + 2);
    return value;
  }

  state.remaining_length = 0;
  state.truncated = true;
  return truncate_payload_text(value, available_length).text;
}

/**
 * Build a bounded JSON-safe clone so traversal stops with the display budget.
 *
 * @param {unknown} value
 * @param {object} state
 * @param {number} depth
 * @param {Set<object>} ancestors
 * @returns {unknown}
 */
function get_bounded_payload_value(value, state, depth, ancestors) {
  if (value === null) {
    consume_payload_budget(state, 4);
    return null;
  }
  if (typeof value === 'string') return get_bounded_payload_string(value, state);
  if (typeof value === 'bigint') return get_bounded_payload_string(`${value}n`, state);
  if (typeof value === 'function') {
    return get_bounded_payload_string(
      `[Function${value.name ? ` ${value.name}` : ''}]`,
      state,
    );
  }
  if (typeof value === 'symbol') {
    return get_bounded_payload_string(String(value), state);
  }
  if (typeof value === 'undefined') {
    consume_payload_budget(state, 9);
    return undefined;
  }
  if (typeof value !== 'object') {
    consume_payload_budget(state, String(value).length);
    return value;
  }

  const object_descriptor = get_payload_object_descriptor(value);
  if (object_descriptor) {
    return get_bounded_payload_string(object_descriptor, state);
  }

  const constructor_name = get_payload_constructor_name(value);
  if (constructor_name === 'Date') {
    const date_value = value.toJSON();
    if (date_value === null) return null;
    return get_bounded_payload_string(date_value, state);
  }

  if (ancestors.has(value)) {
    return get_bounded_payload_string('[Circular]', state);
  }
  if (depth >= state.max_depth) {
    state.truncated = true;
    return get_bounded_payload_string(payload_depth_marker, state);
  }
  if (!consume_payload_budget(state, 2)) return payload_truncation_marker;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        if (state.truncated) break;
        if (index > 0 && !consume_payload_budget(state, 1)) {
          output.push(payload_truncation_marker);
          break;
        }
        output.push(get_bounded_payload_value(
          value[index],
          state,
          depth + 1,
          ancestors,
        ));
      }
      return output;
    }

    const output = {};
    let property_count = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (state.truncated) break;
      const property_cost = key.length + 3 + (property_count > 0 ? 1 : 0);
      if (!consume_payload_budget(state, property_cost)) {
        output['...'] = payload_truncation_marker;
        break;
      }
      output[key] = get_bounded_payload_value(
        value[key],
        state,
        depth + 1,
        ancestors,
      );
      property_count += 1;
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * @param {unknown} value
 * @param {object} [params={}]
 * @param {number} [params.max_depth]
 * @param {number} [params.max_length]
 * @returns {{ text: string, truncated: boolean }}
 */
function get_payload_value_result(value, params = {}) {
  const normalized_max_depth = normalize_payload_limit(
    params.max_depth,
    max_payload_depth,
  );
  const normalized_max_length = normalize_payload_limit(
    params.max_length,
    max_payload_output_length,
  );

  if (typeof value === 'string') {
    return truncate_payload_text(value, normalized_max_length);
  }
  if (typeof value === 'bigint') {
    return truncate_payload_text(`${value}n`, normalized_max_length);
  }
  if (typeof value === 'function') {
    return truncate_payload_text(
      `[Function${value.name ? ` ${value.name}` : ''}]`,
      normalized_max_length,
    );
  }
  if (typeof value === 'symbol') {
    return truncate_payload_text(String(value), normalized_max_length);
  }

  const object_descriptor = get_payload_object_descriptor(value);
  if (object_descriptor) {
    return truncate_payload_text(object_descriptor, normalized_max_length);
  }

  try {
    const state = {
      max_depth: normalized_max_depth,
      remaining_length: normalized_max_length,
      truncated: false,
    };
    const bounded_value = get_bounded_payload_value(
      value,
      state,
      0,
      new Set(),
    );
    const payload_text = JSON.stringify(bounded_value);
    const next_result = truncate_payload_text(
      typeof payload_text === 'string'
        ? payload_text
        : get_payload_value_fallback_text(value),
      normalized_max_length,
    );
    return {
      text: next_result.text,
      truncated: state.truncated || next_result.truncated,
    };
  } catch {
    return truncate_payload_text(
      get_payload_value_fallback_text(value),
      normalized_max_length,
    );
  }
}

/**
 * @param {object} entry
 * @param {object} [params={}]
 * @param {number} [params.max_depth]
 * @param {number} [params.max_output_length]
 * @returns {string}
 */
export function get_entry_payload_text(entry, params = {}) {
  const normalized_max_depth = normalize_payload_limit(
    params.max_depth,
    max_payload_depth,
  );
  const normalized_max_output_length = normalize_payload_limit(
    params.max_output_length,
    max_payload_output_length,
  );
  const event_obj = entry?.event && typeof entry.event === 'object' ? entry.event : {};
  const event_descriptor = get_payload_object_descriptor(event_obj);
  if (event_descriptor) {
    return truncate_payload_text(
      `  event: ${event_descriptor}`,
      normalized_max_output_length,
    ).text;
  }

  const truncation_line = `  ...: ${payload_truncation_marker}`;
  const content_limit = Math.max(
    0,
    normalized_max_output_length - truncation_line.length - 1,
  );
  const payload_lines = [];
  let payload_length = 0;
  let truncated = false;

  try {
    for (const key in event_obj) {
      if (!Object.prototype.hasOwnProperty.call(event_obj, key)) continue;
      if (omitted_payload_keys.has(key)) continue;

      const separator_length = payload_lines.length > 0 ? 1 : 0;
      const line_prefix = `  ${key}: `;
      const remaining_length = content_limit
        - payload_length
        - separator_length
        - line_prefix.length
      ;
      if (remaining_length <= 0) {
        truncated = true;
        break;
      }

      let value_result;
      try {
        value_result = get_payload_value_result(event_obj[key], {
          max_depth: normalized_max_depth,
          max_length: remaining_length,
        });
      } catch {
        value_result = truncate_payload_text(
          '[Unserializable Property]',
          remaining_length,
        );
      }

      const line = `${line_prefix}${value_result.text}`;
      payload_lines.push(line);
      payload_length += separator_length + line.length;
      if (value_result.truncated) {
        truncated = true;
        break;
      }
    }
  } catch {
    return truncate_payload_text(
      `  event: ${get_payload_value_fallback_text(event_obj)}`,
      normalized_max_output_length,
    ).text;
  }

  const payload_text = payload_lines.join('\n');
  if (!truncated) return payload_text;
  if (!payload_text) {
    return truncation_line.slice(0, normalized_max_output_length);
  }
  return `${payload_text}\n${truncation_line}`;
}

/**
 * @param {object} entry
 * @returns {{ btn_text: string, btn_callback: string }|null}
 */
export function get_entry_summary_action(entry) {
  const event_obj = entry?.event && typeof entry.event === 'object' ? entry.event : {};
  const btn_text = typeof event_obj.btn_text === 'string' ? event_obj.btn_text.trim() : '';
  const btn_callback = typeof event_obj.btn_callback === 'string' ? event_obj.btn_callback.trim() : '';
  if (!btn_text || !btn_callback) return null;
  return { btn_text, btn_callback };
}

/**
 * @param {object} entry
 * @returns {string}
 */
export function get_entry_help_link(entry) {
  const event_obj = entry?.event && typeof entry.event === 'object' ? entry.event : {};
  if (typeof event_obj.link === 'string' && event_obj.link.trim()) return event_obj.link.trim();
  if (typeof event_obj.help_link === 'string' && event_obj.help_link.trim()) return event_obj.help_link.trim();
  return '';
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
