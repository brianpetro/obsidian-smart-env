import test from 'ava';

import {
  build_notice_event_payload,
  emit_notice_event,
  get_notice_event_env,
} from './emit_notice_event.js';

test('get_notice_event_env resolves env from scope or env directly', (t) => {
  const direct_env = { events: { emit() {} } };
  const scoped_env = { env: direct_env };

  t.is(get_notice_event_env(direct_env), direct_env);
  t.is(get_notice_event_env(scoped_env), direct_env);
  t.is(get_notice_event_env({}), null);
});

test('build_notice_event_payload keeps level, optional notice fields, and timeout override', (t) => {
  t.deepEqual(build_notice_event_payload({
    level: 'warning',
    message: 'Copied link.',
    details: 'Manual fallback available.',
    btn_text: 'Retry',
    btn_callback: 'clipboard:retry_copy',
    link: 'https://example.com/help',
    event_source: 'unit_test',
    timeout_ms: 1500,
  }), {
    level: 'warning',
    message: 'Copied link.',
    details: 'Manual fallback available.',
    btn_text: 'Retry',
    btn_callback: 'clipboard:retry_copy',
    link: 'https://example.com/help',
    event_source: 'unit_test',
    timeout_ms: 1500,
  });

  t.deepEqual(build_notice_event_payload({
    timeout: 900,
  }), {
    level: 'info',
    timeout_ms: 900,
  });
});

test('emit_notice_event emits payload through env events', (t) => {
  const emitted = [];
  const env = {
    events: {
      emit(event_key, payload) {
        emitted.push({ event_key, payload });
      },
    },
  };

  const result = emit_notice_event({ env }, {
    event_key: 'clipboard:copied',
    level: 'info',
    message: 'Copied 123 characters to clipboard.',
    event_source: 'unit_test',
    timeout_ms: 2500,
  });

  t.true(result);
  t.deepEqual(emitted, [{
    event_key: 'clipboard:copied',
    payload: {
      level: 'info',
      message: 'Copied 123 characters to clipboard.',
      event_source: 'unit_test',
      timeout_ms: 2500,
    },
  }]);
});

test('emit_notice_event fails closed without emitter or event key', (t) => {
  t.false(emit_notice_event({}, {
    event_key: 'clipboard:copied',
    level: 'info',
  }));

  t.false(emit_notice_event({
    events: { emit() {} },
  }, {
    event_key: '   ',
    level: 'info',
  }));
});
