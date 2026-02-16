import { Notice } from 'obsidian';
import base from 'smart-events/event_logs.js';
import { EventLogs as BaseEventLogs } from 'smart-events/event_logs.js';

const notice_timeout_ms = 7000;
const milestone_notice_timeout_ms = 12000;

export const settings_config = {
  native_notice_info: {
    name: 'Native notice: Info',
    description: 'Show Obsidian native notices for notification:info events.',
    type: 'toggle',
  },
  native_notice_warning: {
    name: 'Native notice: Warning',
    description: 'Show Obsidian native notices for notification:warning events.',
    type: 'toggle',
  },
  native_notice_error: {
    name: 'Native notice: Error',
    description: 'Show Obsidian native notices for notification:error events.',
    type: 'toggle',
  },
  native_notice_attention: {
    name: 'Native notice: Attention',
    description: 'Show Obsidian native notices for notification:attention events.',
    type: 'toggle',
  },
  native_notice_milestone: {
    name: 'Native notice: Milestone',
    description: 'Show Obsidian native notices for notification:milestone events.',
    type: 'toggle',
  },
};

/**
 * @param {string} event_key
 * @returns {string|null}
 */
export function get_notification_type(event_key) {
  if (typeof event_key !== 'string' || !event_key.startsWith('notification:')) return null;
  const [, notification_type] = event_key.split(':');
  return notification_type || null;
}

/**
 * @param {object} event_log
 * @returns {boolean}
 */
export function is_event_log_muted(event_log) {
  return Boolean(event_log?.data?.muted);
}

/**
 * @param {string|null} notification_type
 * @returns {string|null}
 */
export function get_notification_setting_key(notification_type) {
  if (!notification_type) return null;
  return `native_notice_${notification_type}`;
}

/**
 * @param {object} instance
 * @param {object} params
 * @param {string} params.event_key
 * @returns {boolean}
 */
export function should_show_native_notice(instance, params = {}) {
  const { event_key = '' } = params;
  const notification_type = get_notification_type(event_key);
  if (!notification_type) return false;

  const setting_key = get_notification_setting_key(notification_type);
  if (!setting_key) return false;
  if (instance?.settings?.[setting_key] === false) return false;

  const event_log = instance?.get?.(event_key);
  if (is_event_log_muted(event_log)) return false;

  return true;
}

/**
 * @param {string} event_key
 * @param {Record<string, unknown>} event
 * @returns {string}
 */
export function get_native_notice_message(event_key, event = {}) {
  if (typeof event?.message === 'string' && event.message.trim()) return event.message;
  if (typeof event?.details === 'string' && event.details.trim()) return event.details;
  if (event_key === 'notification:milestone') return 'Milestone reached.';
  return event_key;
}

/**
 * @param {string} event_key
 * @returns {number}
 */
export function get_notice_timeout_ms(event_key) {
  if (event_key === 'notification:milestone') return milestone_notice_timeout_ms;
  return notice_timeout_ms;
}

export class EventLogs extends BaseEventLogs {
  static version = 0.001;

  static get default_settings() {
    return {
      ...(super.default_settings || {}),
      native_notice_info: true,
      native_notice_warning: true,
      native_notice_error: true,
      native_notice_attention: false,
      native_notice_milestone: true,
    };
  }

  get settings_config() {
    return { ...settings_config };
  }

  /**
   * @param {string} event_key
   * @param {Record<string, unknown>} event
   */
  on_any_event(event_key, event = {}) {
    super.on_any_event(event_key, event);
    this.show_native_notice(event_key, event);
  }

  /**
   * @param {string} event_key
   * @param {Record<string, unknown>} event
   */
  show_native_notice(event_key, event = {}) {
    if (!should_show_native_notice(this, { event_key })) return;
    const notice_message = get_native_notice_message(event_key, event);
    const notice_timeout = get_notice_timeout_ms(event_key);
    new Notice(notice_message, notice_timeout);
  }
}

export default {
  ...base,
  class: EventLogs,
  settings_config,
};
