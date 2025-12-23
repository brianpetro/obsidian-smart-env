import styles from './milestones.css';

import {
  escape_html,
} from 'smart-utils';

import { setIcon } from 'obsidian';

import {
  EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY,
  derive_events_checklist_groups,
} from '../utils/onboarding_events.js';

/**
 * Determine whether an event has been emitted.
 *
 * IMPORTANT: Placeholder implementation.
 *
 * @param {import('../smart_env.js').SmartEnv} env
 * @param {string} event_key
 * @returns {boolean}
 */
export function check_if_event_emitted(env, event_key) {
  return !!env.event_logs.items[event_key];
}

/**
 * Build the HTML string for the checklist.
 * @param {import('../smart_env.js').SmartEnv} env
 * @param {object} params
 * @returns {string}
 */
export function build_html(env, params = {}) {
  const groups = derive_events_checklist_groups(EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY);

  const checked_count = groups.reduce((acc, g) => {
    const c = g.items.reduce((inner, item) => {
      return inner + (check_if_event_emitted(env, item.event_key) ? 1 : 0);
    }, 0);
    return acc + c;
  }, 0);
  const total_count = groups.reduce((acc, g) => acc + g.items.length, 0);

  const progress_pct = total_count > 0
    ? Math.round((checked_count / total_count) * 100)
    : 0;

  const groups_html = groups.map((group) => {
    const group_checked_count = group.items.reduce((acc, item) => {
      return acc + (check_if_event_emitted(env, item.event_key) ? 1 : 0);
    }, 0);
    const group_total_count = group.items.length;

    const items_html = group.items.map((item) => {
      const checked = check_if_event_emitted(env, item.event_key) === true;
      return build_item_html(item, { checked });
    }).join('\n');

    return `
      <section class="sc-events-checklist__group" data-group="${escape_html(group.group)}">
        <h3 class="sc-events-checklist__group-title">
          <span class="sc-events-checklist__group-name">${escape_html(group.group)}</span>
          <span class="sc-events-checklist__group-count" aria-label="Group completion">${group_checked_count.toString()} / ${group_total_count.toString()}</span>
        </h3>
        <ul class="sc-events-checklist__items">
          ${items_html}
        </ul>
      </section>
    `;
  }).join('\n');

  return `
    <div
      class="sc-events-checklist"
      data-component="events_checklist"
      style="--sc-events-checklist-progress: ${progress_pct.toString()}%;"
    >
      <div class="sc-events-checklist__header">
        <div class="sc-events-checklist__summary" aria-label="Checklist completion">
          ${checked_count.toString()} / ${total_count.toString()}
        </div>
        <div class="sc-events-checklist__hint" aria-hidden="true">
          Click a milestone to open docs
        </div>
      </div>

      <div
        class="sc-events-checklist__progress"
        role="progressbar"
        aria-label="Overall progress"
        aria-valuenow="${checked_count.toString()}"
        aria-valuemin="0"
        aria-valuemax="${total_count.toString()}"
        title="${escape_html(`${progress_pct.toString()}% complete`)}"
      >
        <div class="sc-events-checklist__progress-fill" aria-hidden="true"></div>
      </div>

      <div class="sc-events-checklist__body">
        ${groups_html}
      </div>
    </div>
  `;
}

/**
 * Render the checklist component.
 * @param {import('../smart_env.js').SmartEnv} env
 * @param {object} params
 * @returns {Promise<HTMLElement>}
 */
export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const html = build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}

/**
 * Post-process: attach any listeners / render nested components.
 * @param {import('../smart_env.js').SmartEnv} env
 * @param {HTMLElement} container
 * @param {object} params
 * @returns {Promise<HTMLElement>}
 */
export async function post_process(env, container, params = {}) {
  attach_item_link_listeners(container);
  render_item_state_icons(container);
  return container;
}

/**
 * @param {{event_key:string, group:string, milestone:string, link:string, is_pro?: boolean}} item
 * @param {{checked:boolean}} state
 * @returns {string}
 */
function build_item_html(item, state) {
  const checked = state.checked === true;
  const checked_flag = checked ? 'true' : 'false';
  const link = typeof item.link === 'string' ? item.link : '';
  const status_label = checked ? 'Completed' : 'Incomplete';
  const aria_label = `Open docs: ${item.milestone || item.event_key || 'milestone'} (${status_label})`;

  return `
    <li
      class="sc-events-checklist__item"
      data-event-key="${escape_html(item.event_key)}"
      data-link="${escape_html(link)}"
      data-checked="${checked_flag}"
      tabindex="0"
      role="button"
      aria-label="${escape_html(aria_label)}"
    >
      <div class="sc-events-checklist__label${item.is_pro ? ' pro-milestone' : ''}">
        <span class="sc-events-checklist__icon" aria-hidden="true"></span>
        <span class="sc-events-checklist__milestone">${escape_html(item.milestone)}</span>
      </div>
    </li>
  `;
}

function attach_item_link_listeners(container) {
  if (!container) return;
  if (container.getAttribute('data-links-enabled') === 'true') return;
  container.setAttribute('data-links-enabled', 'true');

  container.addEventListener('click', (evt) => {
    const item_el = get_item_el_from_event(container, evt);
    if (!item_el) return;

    // prevent if selecting text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;

    open_item_link(item_el);
  });

  container.addEventListener('keydown', (evt) => {
    const key = evt && /** @type {KeyboardEvent} */ (evt).key;
    if (key !== 'Enter' && key !== ' ') return;

    const item_el = get_item_el_from_event(container, evt);
    if (!item_el) return;

    evt.preventDefault();
    open_item_link(item_el);
  });
}

/**
 * @param {HTMLElement} item_el
 */
function open_item_link(item_el) {
  const link = get_item_link(item_el);
  if (typeof link === 'string' && link.length > 0) {
    window.open(link, '_external');
  }
}

/**
 * Render check / incomplete icons using Obsidian's setIcon.
 * @param {HTMLElement} container
 */
function render_item_state_icons(container) {
  if (!container) return;

  const item_els = Array.from(container.querySelectorAll('.sc-events-checklist__item'));
  item_els.forEach((item_el) => {
    const checked = item_el.getAttribute('data-checked') === 'true';
    const icon_el = item_el.querySelector('.sc-events-checklist__icon');
    if (!icon_el) return;
    set_item_icon(/** @type {HTMLElement} */ (icon_el), checked);
  });
}

/**
 * @param {HTMLElement} icon_el
 * @param {boolean} checked
 */
function set_item_icon(icon_el, checked) {
  const icon_ids = checked
    ? ['circle-check', 'check-circle', 'check']
    : ['circle', 'circle-dashed', 'dot'];

  set_icon_with_fallback(icon_el, icon_ids);
}

/**
 * @param {HTMLElement} icon_el
 * @param {string[]} icon_ids
 */
function set_icon_with_fallback(icon_el, icon_ids) {
  if (!icon_el) return;
  const ids = Array.isArray(icon_ids) ? icon_ids : [];

  for (const icon_id of ids) {
    if (typeof icon_id !== 'string' || icon_id.length === 0) continue;

    icon_el.textContent = '';

    try {
      setIcon(icon_el, icon_id);
    } catch (err) {
      continue;
    }

    // If the icon id is unknown, Obsidian may not throw; verify something rendered.
    if (icon_el.querySelector('svg')) return;
  }
}

/**
 * @param {HTMLElement} container
 * @param {Event} evt
 * @returns {HTMLElement|null}
 */
function get_item_el_from_event(container, evt) {
  const target = evt && /** @type {any} */ (evt).target;
  if (!target || typeof target.closest !== 'function') return null;
  const item_el = target.closest('.sc-events-checklist__item');
  if (!item_el) return null;
  if (!container.contains(item_el)) return null;
  return item_el;
}

/**
 * @param {HTMLElement} item_el
 * @returns {string}
 */
function get_item_link(item_el) {
  const data_link = item_el.getAttribute('data-link');
  if (typeof data_link === 'string' && data_link.length > 0) return data_link;

  const event_key = item_el.getAttribute('data-event-key');
  if (typeof event_key !== 'string' || event_key.length === 0) return '';

  const item = EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY[event_key];
  if (!item || typeof item.link !== 'string') return '';
  return item.link;
}
