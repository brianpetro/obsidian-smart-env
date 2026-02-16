import test from 'ava';

import {
  get_native_notice_message,
  get_notification_setting_key,
  get_notification_type,
  should_show_native_notice,
} from './event_logs.js';

test('get_notification_type parses notification keys', (t) => {
  t.is(get_notification_type('notification:warning'), 'warning');
  t.is(get_notification_type('notification:milestone'), 'milestone');
  t.is(get_notification_type('sync:warning'), null);
  t.is(get_notification_type('notification:'), null);
});

test('get_notification_setting_key maps notification type to setting', (t) => {
  t.is(get_notification_setting_key('warning'), 'native_notice_warning');
  t.is(get_notification_setting_key('milestone'), 'native_notice_milestone');
  t.is(get_notification_setting_key(null), null);
});

test('should_show_native_notice applies setting and mute gates', (t) => {
  const active_instance = {
    settings: { native_notice_warning: true },
    get: () => ({ data: { muted: false } }),
  };

  const disabled_instance = {
    settings: { native_notice_warning: false },
    get: () => ({ data: { muted: false } }),
  };

  const muted_instance = {
    settings: { native_notice_warning: true },
    get: () => ({ data: { muted: true } }),
  };

  t.true(should_show_native_notice(active_instance, { event_key: 'notification:warning' }));
  t.false(should_show_native_notice(disabled_instance, { event_key: 'notification:warning' }));
  t.false(should_show_native_notice(muted_instance, { event_key: 'notification:warning' }));
  t.false(should_show_native_notice(active_instance, { event_key: 'sync:error' }));
});

test('get_native_notice_message uses event message and milestone fallback', (t) => {
  t.is(get_native_notice_message('notification:info', { message: 'hello' }), 'hello');
  t.is(get_native_notice_message('notification:info', { details: 'detail text' }), 'detail text');
  t.is(get_native_notice_message('notification:milestone', {}), 'Milestone reached.');
  t.is(get_native_notice_message('notification:error', {}), 'notification:error');
});
