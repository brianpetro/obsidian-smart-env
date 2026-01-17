import test from 'ava';
import {
  EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY,
  derive_events_checklist_groups,
} from './onboarding_events_data.js';

test('events checklist includes file-nav context copy milestone', (t) => {
  const item = EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY['context:file_nav_copied'];

  t.truthy(item);
  t.is(item.group, 'Context');
  t.regex(item.milestone, /file navigator/i);
});

test('derive_events_checklist_groups groups file-nav copy milestone under Context', (t) => {
  const groups = derive_events_checklist_groups(EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY);
  const context_group = groups.find((group) => group.group === 'Context');

  t.truthy(context_group);
  const event_keys = context_group.items.map((item) => item.event_key);
  t.true(event_keys.includes('context:file_nav_copied'));
});
