import test from 'ava';

import {
  get_notification_event_count,
  get_status_bar_state,
} from './status_bar_state.js';

test('get_notification_event_count counts only notification events', (t) => {
  const event_logs = {
    session_events: [
      { event_key: 'notification:info' },
      { event_key: 'connections:opened' },
      { event_key: 'notification:warning' },
      { event_key: 42 },
    ],
  };

  t.is(get_notification_event_count(event_logs), 2);
  t.is(get_notification_event_count({ session_events: [] }), 0);
  t.is(get_notification_event_count(null), 0);
});

test('get_status_bar_state prioritizes embed queue message', (t) => {
  const env = {
    is_pro: false,
    constructor: { version: '1.2.3' },
    smart_sources: { sources_re_import_queue: { a: true, b: true } },
    event_logs: { session_events: [], notification_status: 'warning' },
  };

  const state = get_status_bar_state(env);

  t.is(state.message, 'Embed now (2)');
  t.is(state.title, 'Click to re-import.');
  t.is(state.indicator_count, 0);
  t.is(state.indicator_level, 'attention');
});

test('get_status_bar_state uses notification count when no embed queue', (t) => {
  const env = {
    is_pro: true,
    constructor: { version: '9.9.9' },
    smart_sources: { sources_re_import_queue: {} },
    event_logs: {
      session_events: [
        { event_key: 'notification:attention' },
        { event_key: 'notification:warning' },
      ],
      notification_status: 'warning',
    },
  };

  const state = get_status_bar_state(env);

  t.is(state.message, 'Smart Env Pro');
  t.is(state.title, 'Smart Environment status');
  t.is(state.indicator_count, 2);
  t.is(state.indicator_level, 'warning');
});
