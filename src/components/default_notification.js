import { setIcon } from 'obsidian';
import { get_event_level } from 'smart-events/event_level_utils.js';
import styles from './default_notification.css';
import { dispatch_notice_action } from '../utils/notice_action_dispatch.js';

/**
 * @param {unknown} value
 * @returns {string}
 */
function to_trimmed_string(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {string} event_key
 * @param {Record<string, unknown>} [event={}]
 * @returns {string}
 */
export function get_default_notice_title(event_key, event = {}) {
  const message = to_trimmed_string(event?.message);
  if (message) return message;
  return event_key || 'Notification';
}

/**
 * @param {Record<string, unknown>} [event={}]
 * @param {string} [title='']
 * @returns {string}
 */
export function get_default_notice_details(event = {}, title = '') {
  const details = to_trimmed_string(event?.details);
  if (details && details !== title) return details;
  return '';
}

/**
 * @param {string|null} level
 * @returns {string}
 */
function format_level_label(level) {
  const value = typeof level === 'string' ? level : 'info';
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

/**
 * @param {HTMLElement} icon_el
 * @param {string|null} level
 * @returns {void}
 */
function render_icon(icon_el, level) {
  if (!icon_el) return;

  const icon_ids = get_icon_ids(level);
  for (const icon_id of icon_ids) {
    if (typeof icon_id !== 'string' || icon_id.length === 0) continue;

    icon_el.textContent = '';

    try {
      setIcon(icon_el, icon_id);
    } catch (_error) {
      continue;
    }

    if (icon_el.querySelector('svg')) return;
  }

  icon_el.textContent = '•';
}

/**
 * @param {string|null} level
 * @returns {string[]}
 */
function get_icon_ids(level) {
  switch (level) {
    case 'error':
      return ['circle-alert', 'alert-circle', 'octagon-alert'];
    case 'warning':
      return ['triangle-alert', 'alert-triangle', 'circle-alert'];
    case 'attention':
      return ['bell-ring', 'bell', 'info'];
    case 'milestone':
      return ['sparkles', 'badge-check', 'circle-check'];
    default:
      return ['info', 'badge-info', 'circle-alert'];
  }
}

/**
 * @param {string} event_key
 * @param {Record<string, unknown>} [event={}]
 * @returns {string}
 */
function get_default_notice_summary(event_key, event = {}) {
  const title = get_default_notice_title(event_key, event);
  const details = get_default_notice_details(event, title);
  if (!details) return title;
  return `${title}
${details}`;
}

/**
 * @param {any} env
 * @param {object} [params={}]
 * @param {Function|null} [params.on_open_feed=null]
 * @returns {boolean}
 */
function open_notifications_feed(env, params = {}) {
  const { on_open_feed = null } = params;
  if (typeof on_open_feed === 'function') {
    return on_open_feed() !== false;
  }
  if (typeof env?.open_notifications_feed_modal === 'function') {
    env.open_notifications_feed_modal();
    return true;
  }
  return false;
}

/**
 * Render a default native notice fragment for canonical notice events.
 *
 * @param {any} env
 * @param {object} [params={}]
 * @param {string} [params.event_key='']
 * @param {Record<string, unknown>} [params.event={}]
 * @param {(callback_key: string) => boolean} [params.on_action]
 * @param {() => boolean} [params.on_mute]
 * @param {Function|null} [params.on_open_feed=null]
 * @returns {DocumentFragment|string}
 */
export function render(env, params = {}) {
  const {
    event_key = '',
    event = {},
    on_action = null,
    on_mute = null,
    on_open_feed = null,
  } = params;

  const level = get_event_level(event_key, event) || 'info';
  const title = get_default_notice_title(event_key, event);
  const details = get_default_notice_details(event, title);
  const btn_text = to_trimmed_string(event?.btn_text);
  const btn_callback = to_trimmed_string(event?.btn_callback);
  const help_link = to_trimmed_string(event?.link);

  if (typeof document === 'undefined') {
    return get_default_notice_summary(event_key, event);
  }

  this.apply_style_sheet?.(styles);

  const run_action = typeof on_action === 'function'
    ? on_action
    : (callback_key) => dispatch_notice_action(env, callback_key, {
      event_source: 'default_notification',
      source_event_key: event_key,
      source_event: event,
    })
  ;

  const run_mute = typeof on_mute === 'function'
    ? on_mute
    : () => false
  ;

  const can_open_feed = typeof on_open_feed === 'function'
    || typeof env?.open_notifications_feed_modal === 'function'
  ;

  const frag = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.className = 'smart-env-default-notice';
  wrapper.dataset.level = level;

  const surface_el = document.createElement('div');
  surface_el.className = 'smart-env-default-notice__surface';

  const icon_el = document.createElement('button');
  icon_el.type = 'button';
  icon_el.className = 'smart-env-default-notice__icon clickable-icon';
  icon_el.setAttribute('aria-label', 'Open events and notifications');
  icon_el.setAttribute('title', 'Open events and notifications');
  icon_el.disabled = !can_open_feed;
  render_icon(icon_el, level);
  if (can_open_feed) {
    icon_el.addEventListener('click', (event_obj) => {
      event_obj.preventDefault();
      event_obj.stopPropagation();
      open_notifications_feed(env, { on_open_feed });
    });
  }

  const body_el = document.createElement('div');
  body_el.className = 'smart-env-default-notice__body';

  const eyebrow_el = document.createElement('div');
  eyebrow_el.className = 'smart-env-default-notice__eyebrow';
  eyebrow_el.textContent = `${format_level_label(level)}`;

  const title_el = document.createElement('div');
  title_el.className = 'smart-env-default-notice__title';
  title_el.textContent = title;

  body_el.appendChild(eyebrow_el);
  body_el.appendChild(title_el);

  if (details) {
    const details_el = document.createElement('div');
    details_el.className = 'smart-env-default-notice__details';
    details_el.textContent = details;
    body_el.appendChild(details_el);
  }

  const should_render_actions = Boolean(btn_text && btn_callback)
    || Boolean(help_link)
    || Boolean(event_key)
  ;

  if (should_render_actions) {
    const actions_el = document.createElement('div');
    actions_el.className = 'smart-env-default-notice__actions';

    if (btn_text && btn_callback) {
      const button_el = document.createElement('button');
      button_el.type = 'button';
      button_el.className = 'smart-env-default-notice__button mod-cta';
      button_el.textContent = btn_text;
      button_el.setAttribute('aria-label', btn_text);
      button_el.addEventListener('click', () => {
        run_action(btn_callback);
      });
      actions_el.appendChild(button_el);
    }

    if (help_link) {
      const link_el = document.createElement('a');
      link_el.className = 'smart-env-default-notice__link';
      link_el.href = help_link;
      link_el.textContent = 'Learn more';
      link_el.target = '_external';
      link_el.rel = 'noopener noreferrer';
      link_el.setAttribute('aria-label', 'Learn more about this notification');
      actions_el.appendChild(link_el);
    }

    if (event_key) {
      const mute_btn_el = document.createElement('button');
      mute_btn_el.type = 'button';
      mute_btn_el.className = 'smart-env-default-notice__mute';
      mute_btn_el.textContent = 'Mute';
      setIcon(mute_btn_el, 'bell-off');
      mute_btn_el.setAttribute('aria-label', 'Mute future native notices for this event key');
      mute_btn_el.addEventListener('click', () => {
        const muted = run_mute();
        if (muted === false) return;
        wrapper.dataset.muted = 'true';
        mute_btn_el.disabled = true;
        mute_btn_el.textContent = 'Muted';
      });
      actions_el.appendChild(mute_btn_el);
    }

    body_el.appendChild(actions_el);
  }

  surface_el.appendChild(icon_el);
  surface_el.appendChild(body_el);
  wrapper.appendChild(surface_el);
  frag.appendChild(wrapper);
  return frag;
}
