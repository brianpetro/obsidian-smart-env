import { Notice } from 'obsidian';
import base from 'smart-events/event_logs.js';
import { EventLogs as BaseEventLogs } from 'smart-events/event_logs.js';
import { get_event_level } from 'smart-events/event_level_utils.js';
import {
  get_native_notice_message,
  get_notification_setting_key,
  is_event_log_muted,
  should_show_native_notice,
} from '../utils/event_logs_utils.js';
import { dispatch_notice_action } from '../utils/notice_action_dispatch.js';

export const settings_config = {
  native_notice_info: {
    name: 'Native notice: Info',
    description: 'Show Obsidian native notices for info level events.',
    type: 'toggle',
  },
  native_notice_warning: {
    name: 'Native notice: Warning',
    description: 'Show Obsidian native notices for warning level events.',
    type: 'toggle',
  },
  native_notice_error: {
    name: 'Native notice: Error',
    description: 'Show Obsidian native notices for error level events.',
    type: 'toggle',
  },
  native_notice_attention: {
    name: 'Native notice: Attention',
    description: 'Show Obsidian native notices for attention level events.',
    type: 'toggle',
  },
  native_notice_milestone: {
    name: 'Native notice: Milestone',
    description: 'Show Obsidian native notices for milestone level events.',
    type: 'toggle',
  },
};

const native_notice_component_key_map = Object.freeze({
  milestone: 'milestone_notification',
});

export { get_notification_setting_key, is_event_log_muted, should_show_native_notice };

/**
 * Resolve an optional native-notice component renderer.
 *
 * Known notice types can opt into a type-specific component. Everything else
 * falls back to the default notice component while still remaining fail-closed
 * for unknown levels.
 *
 * @param {string} event_key
 * @param {Record<string, unknown>} [event={}]
 * @returns {string|null} The component key if a renderer is available, otherwise null.
 */
export function get_native_notice_component_key(event_key, event = {}) {
  const level = get_event_level(event_key, event);
  if (!level) return null;
  return native_notice_component_key_map[level] || 'default_notification';
}

export class EventLogs extends BaseEventLogs {
  static version = 0.004;

  static get default_settings() {
    return {
      ...(super.default_settings || {}),
      native_notice_info: false,
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
   * @returns {object|null}
   */
  on_any_event(event_key, event = {}) {
    const session_entry = super.on_any_event(event_key, event);
    this.show_native_notice(session_entry, { event_key, event });
    return session_entry;
  }

  /**
   * @param {object|null} session_entry
   * @param {object} [params={}]
   * @param {string} [params.event_key='']
   * @param {Record<string, unknown>} [params.event={}]
   * @returns {boolean}
   */
  async show_native_notice(session_entry, params = {}) {
    const { event_key = '', event = {} } = params;
    if (!should_show_native_notice(this, { event_key, event })) return false;

    try {
      const notice_content = await this.build_native_notice_content(event_key, event);
      const notice_timeout = event.timeout ?? event.timeout_ms ?? 5000;
      new Notice(notice_content, notice_timeout);
    } catch (error) {
      console.error('EventLogs: failed to show native notice', {
        event_key,
        error,
      });
      return false;
    }

    if (session_entry) {
      this.mark_session_entry_seen(session_entry, { native_notice_shown: true });
    }
    return true;
  }

  /**
   * @param {string} event_key
   * @param {Record<string, unknown>} [event={}]
   * @returns {string|DocumentFragment}
   */
  async build_native_notice_content(event_key, event = {}) {
    const component_key = get_native_notice_component_key(event_key, event);
    if (component_key && this.env?.config?.components?.[component_key]) {
      const component_content = await this.env.smart_components.render_component(component_key, this.env, {
        event_key,
        event,
        on_action: (callback_key) => this.run_notice_callback(callback_key, { event_key, event }),
        on_mute: () => this.set_event_key_muted(event_key, true),
      });
      if (component_content) return component_content;
    }

    const notice_message = get_native_notice_message(event_key, event);
    const btn_text = typeof event?.btn_text === 'string' ? event.btn_text.trim() : '';
    const btn_callback = typeof event?.btn_callback === 'string' ? event.btn_callback.trim() : '';

    if (!btn_text || !btn_callback || typeof document === 'undefined') {
      return notice_message;
    }

    const frag = document.createDocumentFragment();

    const message_el = document.createElement('div');
    message_el.textContent = notice_message;
    frag.appendChild(message_el);

    const button_el = document.createElement('button');
    button_el.type = 'button';
    button_el.className = 'mod-cta';
    button_el.textContent = btn_text;
    button_el.addEventListener('click', () => {
      this.run_notice_callback(btn_callback, { event_key, event });
    });
    frag.appendChild(button_el);

    return frag;
  }

  /**
   * @param {string} callback_key
   * @param {object} [params={}]
   * @param {string} [params.event_key='']
   * @param {Record<string, unknown>} [params.event={}]
   * @returns {boolean}
   */
  run_notice_callback(callback_key, params = {}) {
    return dispatch_notice_action(this.env, callback_key, {
      event_source: 'native_notice_button',
      source_event_key: params.event_key,
      source_event: params.event,
    });
  }

  /**
   * @param {string} event_key
   * @returns {boolean}
   */
  is_event_key_muted(event_key) {
    return is_event_log_muted(this.get?.(event_key));
  }

  /**
   * @param {string} event_key
   * @param {boolean} [muted=true]
   * @returns {boolean}
   */
  set_event_key_muted(event_key, muted = true) {
    const event_log = this.get?.(event_key);
    if (!event_log) return false;

    event_log.data = {
      ...event_log.data,
      muted: Boolean(muted),
    };
    event_log.queue_save?.();
    this.queue_save?.();

    this.env?.events?.emit?.('event_logs:mute_changed', {
      event_key,
      muted: Boolean(muted),
    });
    return true;
  }

  /**
   * @param {string} event_key
   * @returns {boolean}
   */
  toggle_event_key_muted(event_key) {
    const next_muted = !this.is_event_key_muted(event_key);
    return this.set_event_key_muted(event_key, next_muted);
  }
}

export default {
  ...base,
  class: EventLogs,
  settings_config,
};
