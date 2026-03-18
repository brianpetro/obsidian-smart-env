import test from 'ava';

import {
  are_all_levels_active,
  create_all_levels_set,
  get_canonical_entry_level,
  get_entry_level,
  get_filtered_entries,
  get_level_counts,
  get_next_active_levels,
  is_canonical_notification_entry,
} from './notifications_feed_utils.js';

test('get_entry_level is payload-first and keeps legacy fallback', (t) => {
  t.is(get_entry_level({
    event_key: 'notification:warning',
    event: { level: ' error ' },
  }), 'error');

  t.is(get_entry_level({
    event_key: 'notification:info',
    event: {},
  }), 'info');
});

test('get_entry_level supports display-only error fallback for feed rows', (t) => {
  t.is(get_entry_level({
    event_key: 'sync:error',
    event: {},
  }), 'error');

  t.is(get_entry_level({
    event_key: 'sync:warning',
    event: {},
  }), null);
});

test('canonical helpers ignore feed-only fallback rows', (t) => {
  const feed_only_entry = {
    event_key: 'sync:error',
    event: {},
  };
  const canonical_entry = {
    event_key: 'sync:error',
    event: { level: 'error' },
  };

  t.is(get_canonical_entry_level(feed_only_entry), null);
  t.false(is_canonical_notification_entry(feed_only_entry));

  t.is(get_canonical_entry_level(canonical_entry), 'error');
  t.true(is_canonical_notification_entry(canonical_entry));
});

test('all-level filter helpers support the all token semantics', (t) => {
  const all_levels = create_all_levels_set();
  t.true(are_all_levels_active(all_levels));

  const warning_only = get_next_active_levels(all_levels, { level: 'warning' });
  t.false(are_all_levels_active(warning_only));
  t.deepEqual([...warning_only], ['warning']);

  const warning_and_error = get_next_active_levels(warning_only, { level: 'error' });
  t.deepEqual([...warning_and_error].sort(), ['error', 'warning']);

  const error_only = get_next_active_levels(warning_and_error, { level: 'warning' });
  t.deepEqual([...error_only], ['error']);

  const reset_to_all = get_next_active_levels(error_only, { level: 'error' });
  t.true(are_all_levels_active(reset_to_all));

  const explicit_all = get_next_active_levels(error_only, { select_all: true });
  t.true(are_all_levels_active(explicit_all));
});

test('get_filtered_entries keeps all events visible when All is active', (t) => {
  const entries = [
    { event_key: 'sync:error', event: {} },
    { event_key: 'domain:event', event: {} },
    { event_key: 'notification:info', event: {} },
  ];

  t.deepEqual(get_filtered_entries(entries), entries);
});

test('get_filtered_entries and get_level_counts use derived levels', (t) => {
  const entries = [
    { event_key: 'sync:error', event: {} },
    { event_key: 'notification:info', event: {} },
    { event_key: 'domain:event', event: { level: 'attention' } },
    { event_key: 'domain:event', event: { level: 'unknown' } },
  ];

  t.deepEqual(
    get_filtered_entries(entries, {
      active_levels: new Set(['error', 'attention']),
    }).map((entry) => get_entry_level(entry)),
    ['error', 'attention'],
  );

  t.deepEqual(get_level_counts(entries), {
    milestone: 0,
    attention: 1,
    error: 1,
    warning: 0,
    info: 1,
  });
});
