import { Modal } from 'obsidian';

export class NotificationsFeedModal extends Modal {
  constructor(app, env, params = {}) {
    super(app);
    this.env = env;
    this.params = params;
  }

  async onOpen() {
    if (this.modalEl?.classList) {
      this.modalEl.classList.add('smart-env-notifications-modal');
    }

    this.titleEl.setText('Events & notifications');

    this.contentEl.empty();
    const event_log = await this.env.smart_components.render_component('notifications_feed', this.env, {
      live_updates: true,
      auto_mark_seen: true,
      ...this.params,
      state: get_notifications_feed_state(this.params),
    });
    this.contentEl.appendChild(event_log);
  }

  onClose() {
    this.contentEl.empty();

    if (this.modalEl?.classList) {
      this.modalEl.classList.remove('smart-env-notifications-modal');
    }
  }
}

/**
 * @param {object} [params={}]
 * @returns {object}
 */
function get_notifications_feed_state(params = {}) {
  const state = params?.state && typeof params.state === 'object'
    ? { ...params.state }
    : {}
  ;
  const target_entry_key = state.target_entry_key || get_target_entry_key(params?.event_key, params?.event);
  if (!target_entry_key) return state;

  const expanded_entry_keys = state.expanded_entry_keys instanceof Set
    ? new Set(state.expanded_entry_keys)
    : new Set()
  ;
  expanded_entry_keys.add(target_entry_key);

  return {
    ...state,
    target_entry_key,
    expanded_entry_keys,
  };
}

/**
 * @param {string} [event_key='']
 * @param {Record<string, unknown>} [event={}]
 * @returns {string}
 */
function get_target_entry_key(event_key = '', event = {}) {
  const next_event_key = typeof event_key === 'string'
    ? event_key.trim()
    : ''
  ;
  if (!next_event_key) return '';

  const at = event?.at;
  if (typeof at !== 'number' || !Number.isFinite(at)) return '';

  return `${next_event_key}:${at}`;
}
