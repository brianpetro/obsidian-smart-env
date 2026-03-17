import test from 'ava';

import {
  get_entry_level,
  get_filtered_entries,
  get_next_visible_count,
  get_visible_count,
  get_visible_entries,
  should_show_load_more,
} from '../utils/notifications_feed_utils.js';

test('get_entry_level stays payload-first and keeps feed-only error fallback', (t) => {
  t.is(get_entry_level({
    event_key: 'notification:warning',
    event: { level: ' error ' },
  }), 'error');

  t.is(get_entry_level({
    event_key: 'sync:error',
    event: {},
  }), 'error');

  t.is(get_entry_level({
    event_key: null,
    event: {},
  }), null);
});

test('get_filtered_entries keeps only selected levels', (t) => {
  const entries = [
    { id: 1, event_key: 'notification:info', event: {} },
    { id: 2, event_key: 'notification:warning', event: {} },
    { id: 3, event_key: 'sync:error', event: {} },
    { id: 4, event_key: 'notification:attention', event: {} },
    { id: 5, event_key: 'notification:milestone', event: {} },
  ];

  const result = get_filtered_entries(entries, { active_levels: new Set(['warning', 'error', 'milestone']) });

  t.deepEqual(result.map((entry) => entry.id), [2, 3, 5]);
});

test('get_visible_entries returns most recent entries up to limit', (t) => {
  const entries = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }));
  const result = get_visible_entries(entries, { limit: 3 });

  t.deepEqual(result.map((entry) => entry.id), [5, 4, 3]);
});

test('pagination helpers cap and increment within bounds', (t) => {
  t.is(get_visible_count(50, { page_size: 100 }), 50);
  t.is(get_visible_count(120, { page_size: 100 }), 100);
  t.is(get_next_visible_count(250, { current_count: 100, step_size: 100 }), 200);
  t.is(get_next_visible_count(250, { current_count: 200, step_size: 100 }), 250);
  t.true(should_show_load_more(150, 100));
  t.false(should_show_load_more(100, 100));
});
