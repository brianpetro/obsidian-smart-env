import styles from './milestones.css';

import {
  escape_html,
} from 'smart-utils';

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

  const groups_html = groups.map((group) => {
    const items_html = group.items.map((item) => {
      const checked = check_if_event_emitted(env, item.event_key) === true;
      return build_item_html(item, { checked });
    }).join('\n');

    return `
      <section class="sc-events-checklist__group" data-group="${escape_html(group.group)}">
        <h3 class="sc-events-checklist__group-title">${escape_html(group.group)}</h3>
        <ul class="sc-events-checklist__items">
          ${items_html}
        </ul>
      </section>
    `;
  }).join('\n');

  return `
    <div class="sc-events-checklist" data-component="events_checklist">
      <div class="sc-events-checklist__header">
        <div class="sc-events-checklist__summary" aria-label="Checklist completion">
          ${checked_count.toString()} / ${total_count.toString()}
        </div>
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
  return container;
}

/**
 * @param {{event_key:string, group:string, milestone:string}} item
 * @param {{checked:boolean}} state
 * @returns {string}
 */
function build_item_html(item, state) {
  const checked = state.checked === true;
  const checked_attr = checked ? 'checked' : '';
  const checked_flag = checked ? 'true' : 'false';
  return `
    <li class="sc-events-checklist__item" data-event-key="${escape_html(item.event_key)}" data-checked="${checked_flag}">
      <label class="sc-events-checklist__label${item.is_pro ? ' pro-milestone' : ''}">
        <input class="sc-events-checklist__checkbox" type="checkbox" disabled ${checked_attr} />
        <span class="sc-events-checklist__milestone">${escape_html(item.milestone)}</span>
      </label>
      <div class="sc-events-checklist__meta">
        <code class="sc-events-checklist__event-key">${escape_html(item.event_key)}</code>
      </div>
    </li>
  `;
}

