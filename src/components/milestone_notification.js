import { setIcon } from 'obsidian';
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
 * @param {any} env
 * @param {string} callback_key
 * @param {object} [params={}]
 * @param {string} [params.event_key='']
 * @param {Record<string, unknown>} [params.event={}]
 * @returns {boolean}
 */
export function dispatch_milestone_notice_action(env, callback_key, params = {}) {
  return dispatch_notice_action(env, callback_key, {
    event_source: 'milestone_notification',
    source_event_key: params.event_key,
    source_event: params.event,
  });
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
 * @param {HTMLElement} el
 * @param {Record<string, string>} style_map
 * @returns {void}
 */
function assign_styles(el, style_map) {
  if (!el || !style_map) return;
  Object.entries(style_map).forEach(([key, value]) => {
    el.style[key] = value;
  });
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

  const frag = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.className = 'smart-env-milestone-notice';
  assign_styles(wrapper, {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: '12px',
    alignItems: 'start',
    minWidth: '0',
  });

  const icon_el = document.createElement('div');
  icon_el.className = 'smart-env-milestone-notice__icon';
  assign_styles(icon_el, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    color: 'var(--color-purple, var(--interactive-accent))',
    flex: '0 0 auto',
  });
  render_icon(icon_el);

  const body_el = document.createElement('div');
  body_el.className = 'smart-env-milestone-notice__body';
  assign_styles(body_el, {
    minWidth: '0',
  });

  const eyebrow_el = document.createElement('div');
  eyebrow_el.className = 'smart-env-milestone-notice__eyebrow';
  eyebrow_el.textContent = 'Smart Milestone';
  assign_styles(eyebrow_el, {
    fontSize: '0.75em',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: '2px',
  });

  const title_el = document.createElement('div');
  title_el.className = 'smart-env-milestone-notice__title';
  title_el.textContent = title;
  assign_styles(title_el, {
    fontWeight: '600',
    lineHeight: '1.3',
    color: 'var(--text-normal)',
  });

  body_el.appendChild(eyebrow_el);
  body_el.appendChild(title_el);

  if (details) {
    const details_el = document.createElement('div');
    details_el.className = 'smart-env-milestone-notice__details';
    details_el.textContent = details;
    assign_styles(details_el, {
      marginTop: '4px',
      lineHeight: '1.35',
      color: 'var(--text-muted)',
      whiteSpace: 'pre-wrap',
    });
    body_el.appendChild(details_el);
  }

  if (btn_text || help_link) {
    const actions_el = document.createElement('div');
    actions_el.className = 'smart-env-milestone-notice__actions';
    assign_styles(actions_el, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap',
      marginTop: '8px',
    });

    if (btn_text && btn_callback) {
      const button_el = document.createElement('button');
      button_el.type = 'button';
      button_el.textContent = btn_text;
      button_el.addEventListener('click', () => {
        if (typeof on_action === 'function') {
          on_action(btn_callback);
          return;
        }
        dispatch_milestone_notice_action(env, btn_callback, { event_key, event });
      });
      actions_el.appendChild(button_el);
    }

    if (help_link) {
      const help_el = document.createElement('a');
      help_el.href = help_link;
      help_el.textContent = 'Learn more';
      help_el.target = '_external';
      help_el.rel = 'noopener noreferrer';
      assign_styles(help_el, {
        fontSize: '0.9em',
        color: 'var(--text-accent)',
      });
      actions_el.appendChild(help_el);
    }

    body_el.appendChild(actions_el);
  }

  wrapper.appendChild(icon_el);
  wrapper.appendChild(body_el);
  frag.appendChild(wrapper);
  return frag;
}
