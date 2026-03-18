import test from 'ava';

import {
  get_native_notice_message,
  get_notification_setting_key,
  is_event_log_muted,
  should_show_native_notice,
} from './event_logs_utils.js';

test('get_notification_setting_key is normalized and fail-closed', (t) => {
  t.is(get_notification_setting_key(' Warning '), 'native_notice_warning');
  t.is(get_notification_setting_key('unknown'), null);
  t.is(get_notification_setting_key(null), null);
});

test('is_event_log_muted reads muted from item data', (t) => {
  t.true(is_event_log_muted({ data: { muted: true } }));
  t.false(is_event_log_muted({ data: { muted: false } }));
  t.false(is_event_log_muted({}));
});

test('should_show_native_notice respects level, settings, and mute state', (t) => {
  const instance = {
    settings: {
      native_notice_error: true,
      native_notice_warning: false,
    },
    constructor: {
      default_settings: {
        native_notice_error: false,
        native_notice_warning: true,
      },
    },
    get(event_key) {
      if (event_key === 'sync:error') return { data: { muted: false } };
      if (event_key === 'sync:warning') return { data: { muted: false } };
      if (event_key === 'sync:muted') return { data: { muted: true } };
      return null;
    },
  };

  t.true(should_show_native_notice(instance, {
    event_key: 'sync:error',
    event: { level: 'error' },
  }));

  t.false(should_show_native_notice(instance, {
    event_key: 'sync:warning',
    event: { level: 'warning' },
  }));

  t.false(should_show_native_notice(instance, {
    event_key: 'sync:muted',
    event: { level: 'error' },
  }));

  t.false(should_show_native_notice(instance, {
    event_key: 'sync:unknown',
    event: { level: 'unknown' },
  }));
});

test('get_native_notice_message prefers message, then details, then milestone, then event key', (t) => {
  t.is(get_native_notice_message('sync:error', {
    message: 'Primary message',
    details: 'More details',
    milestone: 'Milestone fallback',
  }), 'Primary message');

  t.is(get_native_notice_message('sync:error', {
    details: 'More details',
    milestone: 'Milestone fallback',
  }), 'More details');

  t.is(get_native_notice_message('milestones:first_achieved', {
    milestone: 'Milestone fallback',
  }), 'Milestone fallback');

  t.is(get_native_notice_message('sync:error', {}), 'sync:error');
});
