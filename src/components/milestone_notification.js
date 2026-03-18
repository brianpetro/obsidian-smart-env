import { setIcon } from 'obsidian';
import styles from './milestone_notification.css';
import { dispatch_notice_action } from '../utils/notice_action_dispatch.js';

/**
 * @param {Record<string, unknown>} [event={}]
 * @returns {string}
 */
export function get_milestone_notice_title(event = {}) {
  if (typeof event?.message === 'string' && event.message.trim()) return event.message.trim();
  return 'You achieved a new Smart Milestone';
}

/**
 * @param {Record<string, unknown>} [event={}]
 * @returns {string}
 */
export function get_milestone_notice_details(event = {}) {
  if (typeof event?.details === 'string' && event.details.trim()) return event.details.trim();
  if (typeof event?.milestone === 'string' && event.milestone.trim()) return event.milestone.trim();
  return '';
}

/**
 * @param {Record<string, unknown>} [event={}]
 * @returns {string}
 */
export function get_milestone_notice_summary(event = {}) {
  const title = get_milestone_notice_title(event);
  const details = get_milestone_notice_details(event);
  if (!details) return title;
  return `${title}\n${details}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function to_trimmed_string(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {HTMLElement} icon_el
 * @returns {void}
 */
function render_icon(icon_el) {
  if (!icon_el) return;
  try {
    setIcon(icon_el, 'sparkles');
  } catch (_error) {
    /* no-op */
  }
  if (!icon_el.querySelector('svg')) {
    icon_el.textContent = '★';
  }
}

/**
 * Render a richer milestone-native-notice fragment.
 *
 * Receives `env` as the first argument and the notice payload as params.
 * The fragment is safe to pass directly into `new Notice(...)`.
 *
 * @param {any} env
 * @param {object} [params={}]
 * @param {string} [params.event_key='']
 * @param {Record<string, unknown>} [params.event={}]
 * @param {(callback_key: string) => boolean} [params.on_action]
 * @returns {DocumentFragment|string}
 */
export function render(env, params = {}) {
  const {
    event_key = '',
    event = {},
    on_action = null,
  } = params;

  const title = get_milestone_notice_title(event);
  const details = get_milestone_notice_details(event);
  const btn_text = to_trimmed_string(event?.btn_text);
  const btn_callback = to_trimmed_string(event?.btn_callback);
  const help_link = to_trimmed_string(event?.link);

  if (typeof document === 'undefined') {
    return get_milestone_notice_summary(event);
  }

  this.apply_style_sheet?.(styles);

  const run_action = typeof on_action === 'function'
    ? on_action
    : (callback_key) => dispatch_notice_action(env, callback_key, {
      event_source: 'milestone_notification',
      source_event_key: event_key,
      source_event: event,
    })
  ;

  const frag = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.className = 'smart-env-milestone-notice';

  const surface_el = document.createElement('div');
  surface_el.className = 'smart-env-milestone-notice__surface';

  const icon_el = document.createElement('div');
  icon_el.className = 'smart-env-milestone-notice__icon';
  render_icon(icon_el);

  const body_el = document.createElement('div');
  body_el.className = 'smart-env-milestone-notice__body';

  const eyebrow_el = document.createElement('div');
  eyebrow_el.className = 'smart-env-milestone-notice__eyebrow';
  eyebrow_el.textContent = 'Smart Milestone';

  const title_el = document.createElement('div');
  title_el.className = 'smart-env-milestone-notice__title';
  title_el.textContent = title;

  body_el.appendChild(eyebrow_el);
  body_el.appendChild(title_el);

  if (details) {
    const details_el = document.createElement('div');
    details_el.className = 'smart-env-milestone-notice__details';
    details_el.textContent = details;
    body_el.appendChild(details_el);
  }

  if (btn_text || help_link) {
    const actions_el = document.createElement('div');
    actions_el.className = 'smart-env-milestone-notice__actions';

    if (btn_text && btn_callback) {
      const button_el = document.createElement('button');
      button_el.type = 'button';
      button_el.className = 'smart-env-milestone-notice__button mod-cta';
      button_el.textContent = btn_text;
      button_el.setAttribute('aria-label', btn_text);
      button_el.addEventListener('click', () => {
        run_action(btn_callback);
      });
      actions_el.appendChild(button_el);
    }

    if (help_link) {
      const help_el = document.createElement('a');
      help_el.className = 'smart-env-milestone-notice__link';
      help_el.href = help_link;
      help_el.textContent = 'Learn more';
      help_el.target = '_external';
      help_el.rel = 'noopener noreferrer';
      help_el.setAttribute('aria-label', 'Learn more about this milestone');
      actions_el.appendChild(help_el);
    }

    body_el.appendChild(actions_el);
  }

  surface_el.appendChild(icon_el);
  surface_el.appendChild(body_el);
  wrapper.appendChild(surface_el);
  frag.appendChild(wrapper);
  return frag;
}
