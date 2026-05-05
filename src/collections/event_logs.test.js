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

test('get_native_notice_component_key uses type-specific and default component renderers only for canonical levels', (t) => {
  t.is(get_native_notice_component_key('milestones:first_achieved', {
    level: 'milestone',
  }), 'milestone_notification');

  t.is(get_native_notice_component_key('notification:milestone', {}), 'milestone_notification');
  t.is(get_native_notice_component_key('domain:event', { level: 'warning' }), 'default_notification');
  t.is(get_native_notice_component_key('domain:event', { level: 'info' }), 'default_notification');
  t.is(get_native_notice_component_key('domain:event', { level: 'unknown' }), null);
});

test('run_notice_callback preserves explicit button event payloads through dispatch', (t) => {
  const emitted = [];
  const source_event = {
    btn_event_key: 'context_selector:open',
    btn_event_payload: {
      collection_key: 'smart_contexts',
      item_key: 'Alpha',
    },
  };
  const instance = {
    env: {
      events: {
        emit(event_key, payload) {
          emitted.push({ event_key, payload });
        },
      },
    },
  };

  const result = EventLogs.prototype.run_notice_callback.call(instance, 'context_selector:open', {
    event_key: 'context:named_context_remove_blocked',
    event: source_event,
  });

  t.true(result);
  t.deepEqual(emitted, [{
    event_key: 'context_selector:open',
    payload: {
      collection_key: 'smart_contexts',
      item_key: 'Alpha',
      event_source: 'native_notice_button',
      source_event_key: 'context:named_context_remove_blocked',
      source_event,
    },
  }]);
});

