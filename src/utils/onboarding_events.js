import { Notice } from 'obsidian';
import {
  EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY,
  check_if_event_emitted,
  derive_events_checklist_groups,
} from './onboarding_events_data.js';

export { EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY, check_if_event_emitted, derive_events_checklist_groups };

export function register_first_of_event_notifications(env) {
  env.events.on('event_log:first', (data) => {
    const event_key = data?.first_of_event_key;
    if (typeof event_key === 'string' && event_key in EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY) {
      const frag = document.createDocumentFragment();
      const msg = `You achieved a new Smart Milestone 🎉`;
      const msg_el = document.createElement('p');
      msg_el.textContent = msg;
      frag.appendChild(msg_el);
      const milestone_el = document.createElement('p');
      milestone_el.textContent = `✅ ${EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY[event_key].milestone}`;
      milestone_el.style.color = 'var(--color-green)';
      milestone_el.style.fontStyle = 'italic';
      frag.appendChild(milestone_el);
      const btn = document.createElement('button');
      btn.textContent = 'View milestones';
      btn.addEventListener('click', () => {
        env.open_milestones_modal();
      });
      frag.appendChild(btn);
      new Notice(frag, 7000);
    }
  });
}
