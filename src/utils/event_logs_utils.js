import {
  get_event_level,
  normalize_event_level,
  notification_levels,
} from 'smart-events/event_level_utils.js';

export const notice_timeout_ms = 7000;
export const milestone_notice_timeout_ms = 12000;

/**
 * @param {object} event_log
 * @returns {boolean}
 */
export function is_event_log_muted(event_log) {
  return Boolean(event_log?.data?.muted);
}

/**
 * @param {string|null} level
 * @returns {string|null}
 */
export function get_notification_setting_key(level) {
  const normalized_level = normalize_event_level(level);
  if (!normalized_level) return null;
  if (!notification_levels.includes(normalized_level)) return null;
  return `native_notice_${normalized_level}`;
}

/**
 * @param {object} instance
 * @param {string} setting_key
 * @returns {boolean}
 */
function get_notice_setting_value(instance, setting_key) {
  if (!setting_key) return false;
  const explicit_value = instance?.settings?.[setting_key];
  if (typeof explicit_value === 'boolean') return explicit_value;
  const default_value = instance?.constructor?.default_settings?.[setting_key];
  if (typeof default_value === 'boolean') return default_value;
  return false;
}

/**
 * @param {object} instance
 * @param {object} [params={}]
 * @param {string} [params.event_key='']
 * @param {Record<string, unknown>} [params.event={}]
 * @returns {boolean}
 */
export function should_show_native_notice(instance, params = {}) {
  const { event_key = '', event = {} } = params;
  const level = get_event_level(event_key, event);
  if (!level) return false;

  const setting_key = get_notification_setting_key(level);
  if (!setting_key) return false;
  if (!get_notice_setting_value(instance, setting_key)) return false;

  const event_log = typeof instance?.get === 'function'
    ? instance.get(event_key)
    : instance?.items?.[event_key]
  ;
  if (is_event_log_muted(event_log)) return false;

  return true;
}

/**
 * @param {string} event_key
 * @param {Record<string, unknown>} [event={}]
 * @returns {string}
 */
export function get_native_notice_message(event_key, event = {}) {
  if (typeof event?.message === 'string' && event.message.trim()) return event.message.trim();
  if (typeof event?.details === 'string' && event.details.trim()) return event.details.trim();
  if (typeof event?.milestone === 'string' && event.milestone.trim()) return event.milestone.trim();
  return event_key || 'notification';
}