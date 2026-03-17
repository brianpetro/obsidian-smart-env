import {
  EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY,
  check_if_event_emitted,
  derive_events_checklist_groups,
} from './onboarding_events_data.js';
/**
 * @param {unknown} event_key
 * @param {object} params
 * @param {Record<string, unknown>} [params.items_by_event_key]
 * @returns {boolean}
 */
export function is_valid_milestone_event(event_key, params = {}) {
  const { items_by_event_key = {} } = params;
  if (typeof event_key !== 'string' || event_key.length === 0) return false;
  return Boolean(items_by_event_key && event_key in items_by_event_key);
}

export { EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY, check_if_event_emitted, derive_events_checklist_groups };

export function register_first_of_event_notifications(env) {
  if (typeof env?.events?.on !== 'function') {
    return () => {};
  }

  const handle_first_event = (data) => {
    const event_key = data?.first_of_event_key;
    if (!is_valid_milestone_event(event_key, { items_by_event_key: EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY })) return;

    const item = EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY[event_key];
    if (!item) return;

    env.events.emit('milestones:first_achieved', {
      level: 'milestone',
      message: 'You achieved a new Smart Milestone',
      details: item.milestone,
      milestone: item.milestone,
      link: item.link,
      first_of_event_key: event_key,
      event_source: 'onboarding_events',
      btn_text: 'View milestones',
      btn_callback: 'milestones_modal:open',
    });
  };

  const unsubscribe = env.events.on('event_log:first', handle_first_event);

  return () => {
    unsubscribe?.();
  };
}
