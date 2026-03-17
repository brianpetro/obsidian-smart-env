import test from 'ava';

import { dispatch_notice_action } from './notice_action_dispatch.js';

function create_env() {
  const emitted = [];
  const executed = [];
  return {
    emitted,
    executed,
    main: {
      app: {
        commands: {
          commands: {
            'known:command': {},
          },
          executeCommandById(command_id) {
            executed.push(command_id);
          },
        },
      },
    },
    events: {
      emit(event_key, payload) {
        emitted.push({ event_key, payload });
      },
    },
  };
}

test('dispatch_notice_action prefers matching Obsidian command ids', (t) => {
  const env = create_env();

  const result = dispatch_notice_action(env, 'known:command', {
    event_source: 'test_notice',
    source_event_key: 'domain:event',
    source_event: { ok: true },
  });

  t.true(result);
  t.deepEqual(env.executed, ['known:command']);
  t.deepEqual(env.emitted, []);
});

test('dispatch_notice_action falls back to env events when no command exists', (t) => {
  const env = create_env();

  const result = dispatch_notice_action(env, 'modal:open', {
    event_source: 'test_notice',
    source_event_key: 'domain:event',
    source_event: { ok: true },
  });

  t.true(result);
  t.deepEqual(env.executed, []);
  t.deepEqual(env.emitted, [{
    event_key: 'modal:open',
    payload: {
      event_source: 'test_notice',
      source_event_key: 'domain:event',
      source_event: { ok: true },
    },
  }]);
});

test('dispatch_notice_action fails closed for empty callback keys', (t) => {
  const env = create_env();

  t.false(dispatch_notice_action(env, '   '));
  t.false(dispatch_notice_action(env, null));
  t.deepEqual(env.executed, []);
  t.deepEqual(env.emitted, []);
});
