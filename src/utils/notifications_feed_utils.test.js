import test from 'ava';

import {
  are_all_levels_active,
  create_all_levels_set,
  debug_levels_filter_key,
  get_entry_summary_action,
  get_canonical_entry_level,
  get_entry_level,
  get_filtered_entries,
  get_level_counts,
  get_next_active_levels,
  is_canonical_notification_entry,
  is_debug_entry,
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

test('all-level filter helpers support All plus explicit Debug token semantics', (t) => {
  const all_levels = create_all_levels_set();
  t.true(are_all_levels_active(all_levels));
  t.true(all_levels.has(debug_levels_filter_key));

  const warning_only = get_next_active_levels(all_levels, { level: 'warning' });
  t.false(are_all_levels_active(warning_only));
  t.deepEqual([...warning_only], ['warning']);

  const warning_and_debug = get_next_active_levels(warning_only, { level: debug_levels_filter_key });
  t.deepEqual([...warning_and_debug].sort(), [debug_levels_filter_key, 'warning']);

  const debug_only = get_next_active_levels(warning_and_debug, { level: 'warning' });
  t.deepEqual([...debug_only], [debug_levels_filter_key]);

  const reset_to_all = get_next_active_levels(debug_only, { level: debug_levels_filter_key });
  t.true(are_all_levels_active(reset_to_all));

  const explicit_all = get_next_active_levels(debug_only, { select_all: true });
  t.true(are_all_levels_active(explicit_all));
});

test('debug filter isolates unlevelled events without affecting canonical rows', (t) => {
  const entries = [
    { event_key: 'sync:error', event: {} },
    { event_key: 'domain:event', event: {} },
    { event_key: 'notification:info', event: {} },
  ];

  t.true(is_debug_entry(entries[1]));
  t.false(is_debug_entry(entries[0]));

  t.deepEqual(
    get_filtered_entries(entries, {
      active_levels: new Set([debug_levels_filter_key]),
    }),
    [entries[1]],
  );
});

test('get_filtered_entries keeps all events visible when All is active', (t) => {
  const entries = [
    { event_key: 'sync:error', event: {} },
    { event_key: 'domain:event', event: {} },
    { event_key: 'notification:info', event: {} },
  ];

  t.deepEqual(get_filtered_entries(entries), entries);
});

test('get_filtered_entries and get_level_counts use derived levels plus debug counts', (t) => {
  const entries = [
    { event_key: 'sync:error', event: {} },
    { event_key: 'notification:info', event: {} },
    { event_key: 'domain:event', event: { level: 'attention' } },
    { event_key: 'domain:event', event: { level: 'unknown' } },
  ];

  t.deepEqual(
    get_filtered_entries(entries, {
      active_levels: new Set(['error', 'attention', debug_levels_filter_key]),
    }).map((entry) => get_entry_level(entry)),
    ['error', 'attention', null],
  );

  t.deepEqual(get_level_counts(entries), {
    milestone: 0,
    attention: 1,
    error: 1,
    warning: 0,
    info: 1,
    debug: 1,
  });
});

test('get_entry_summary_action returns only valid CTA payloads', (t) => {
  t.deepEqual(get_entry_summary_action({
    event: { btn_text: 'View milestones', btn_callback: 'milestones_modal:open' },
  }), {
    btn_text: 'View milestones',
    btn_callback: 'milestones_modal:open',
  });

  t.is(get_entry_summary_action({
    event: { btn_text: 'View milestones', btn_callback: '' },
  }), null);

  t.is(get_entry_summary_action({
    event: { btn_text: '', btn_callback: 'milestones_modal:open' },
  }), null);
});
