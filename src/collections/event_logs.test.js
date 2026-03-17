import test from 'ava';

import {
  EventLogs,
  get_native_notice_component_key,
  get_notification_setting_key,
  is_event_log_muted,
  should_show_native_notice,
} from './event_logs.js';

test('EventLogs default native notice settings stay level-specific and fail-closed', (t) => {
  t.is(EventLogs.default_settings.native_notice_info, false);
  t.is(EventLogs.default_settings.native_notice_warning, true);
  t.is(EventLogs.default_settings.native_notice_error, true);
  t.is(EventLogs.default_settings.native_notice_attention, false);
  t.is(EventLogs.default_settings.native_notice_milestone, true);
});

test('get_notification_setting_key maps supported levels and rejects unknown values', (t) => {
  t.is(get_notification_setting_key('warning'), 'native_notice_warning');
  t.is(get_notification_setting_key('milestone'), 'native_notice_milestone');
  t.is(get_notification_setting_key(' unknown '), null);
  t.is(get_notification_setting_key(null), null);
});

test('is_event_log_muted reads muted from item data', (t) => {
  t.true(is_event_log_muted({ data: { muted: true } }));
  t.false(is_event_log_muted({ data: { muted: false } }));
  t.false(is_event_log_muted({}));
});

test('should_show_native_notice applies payload-first level, setting, and mute gates', (t) => {
  const instance = {
    settings: {
      native_notice_error: true,
      native_notice_warning: false,
    },
    constructor: {
      default_settings: EventLogs.default_settings,
    },
    get(event_key) {
      if (event_key === 'sync:error') return { data: { muted: false } };
      if (event_key === 'sync:warning') return { data: { muted: false } };
      if (event_key === 'sync:muted') return { data: { muted: true } };
      return null;
    },
  };

  t.true(should_show_native_notice(instance, {
    event_key: 'notification:warning',
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
    event_key: 'sync:error',
    event: { level: 'unknown' },
  }));
});

test('get_native_notice_component_key stays closed and level-specific', (t) => {
  t.truthy(get_native_notice_component_key('milestones:first_achieved', {
    level: 'milestone',
  }));

  t.truthy(get_native_notice_component_key('notification:milestone', {}));
  t.is(get_native_notice_component_key('domain:event', { level: 'warning' }), null);
  t.is(get_native_notice_component_key('domain:event', { level: 'unknown' }), null);
});
