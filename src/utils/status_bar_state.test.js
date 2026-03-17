import test from 'ava';

import {
  get_notification_event_count,
  get_notification_indicator_level,
  get_status_bar_state,
} from './status_bar_state.js';

test('notification helpers count unseen entries and escalate severity stably', (t) => {
  const event_logs = {
    session_events: [
      { unseen: true, event_key: 'milestones:first_achieved', event: { level: 'milestone' } },
      { unseen: true, event_key: 'sync:error', event: { level: 'error' } },
      { unseen: false, event_key: 'sync:warning', event: { level: 'warning' } },
    ],
  };

  t.is(get_notification_event_count(event_logs), 2);
  t.is(get_notification_indicator_level(event_logs), 'error');
});

test('status bar shows loading message before progress state exists', (t) => {
  const env = {
    state: 'loading',
    constructor: { version: '2.2.12' },
    event_logs: { session_events: [] },
  };

  t.deepEqual(get_status_bar_state(env), {
    message: 'Loading Smart Env…',
    title: 'Smart Environment is loading.',
    indicator_count: 0,
    indicator_level: null,
    embed_queue_count: 0,
    click_action: 'noop',
  });
});

test('status bar prefers active import progress over generic loading state', (t) => {
  const env = {
    state: 'loading',
    smart_sources: {
      get_import_progress_state() {
        return {
          active: true,
          stage: 'importing',
          progress: 25,
          total: 100,
        };
      },
      entities_vector_adapter: {
        get_progress_state() {
          return null;
        },
      },
      sources_re_import_queue: {},
    },
    event_logs: { session_events: [] },
    constructor: { version: '2.2.12' },
  };

  t.deepEqual(get_status_bar_state(env), {
    message: 'Importing 25/100',
    title: 'Smart Environment is importing sources.',
    indicator_count: 0,
    indicator_level: null,
    embed_queue_count: 0,
    click_action: 'noop',
  });
});

test('status bar shows re-import progress and queued re-import work distinctly', (t) => {
  const reimporting_env = {
    state: 'loaded',
    smart_sources: {
      get_import_progress_state() {
        return {
          active: true,
          stage: 'reimporting',
          progress: 3,
          total: 12,
        };
      },
      entities_vector_adapter: {
        get_progress_state() {
          return null;
        },
      },
      sources_re_import_queue: {
        a: {},
        b: {},
      },
    },
    event_logs: { session_events: [] },
    constructor: { version: '2.2.12' },
  };

  t.is(get_status_bar_state(reimporting_env).message, 'Re-importing 3/12');
  t.is(get_status_bar_state(reimporting_env).click_action, 'noop');

  const queued_env = {
    state: 'loaded',
    smart_sources: {
      get_import_progress_state() {
        return null;
      },
      entities_vector_adapter: {
        get_progress_state() {
          return null;
        },
      },
      sources_re_import_queue: {
        a: {},
        b: {},
        c: {},
      },
    },
    event_logs: { session_events: [] },
    constructor: { version: '2.2.12' },
  };

  t.is(get_status_bar_state(queued_env).message, 'Re-import (3)');
  t.is(get_status_bar_state(queued_env).click_action, 'run_reimport');
});

test('status bar shows embedding pause and resume states', (t) => {
  const env = {
    state: 'loaded',
    smart_sources: {
      get_import_progress_state() {
        return null;
      },
      entities_vector_adapter: {
        get_progress_state() {
          return {
            active: true,
            paused: true,
            progress: 10,
            total: 40,
          };
        },
      },
      sources_re_import_queue: {},
    },
    event_logs: { session_events: [] },
    constructor: { version: '2.2.12' },
  };

  t.deepEqual(get_status_bar_state(env), {
    message: 'Embedding paused 10/40',
    title: 'Click to resume embedding.',
    indicator_count: 0,
    indicator_level: null,
    embed_queue_count: 0,
    click_action: 'resume_embed',
  });
});
