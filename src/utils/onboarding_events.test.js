import test from 'ava';

import {
  is_valid_milestone_event,
  register_first_of_event_notifications,
} from './onboarding_events.js';

function create_env() {
  const handlers = new Map();
  const env = {
    emitted: [],
    events: {
      on(event_key, handler) {
        const list = handlers.get(event_key) || [];
        list.push(handler);
        handlers.set(event_key, list);
        return () => {
          const current = handlers.get(event_key) || [];
          handlers.set(event_key, current.filter((cb) => cb !== handler));
        };
      },
      emit(event_key, payload = {}) {
        env.emitted.push({ event_key, payload });
        const list = handlers.get(event_key) || [];
        list.forEach((handler) => handler(payload, event_key));
      },
    },
  };
  return env;
}

test('is_valid_milestone_event checks map membership', (t) => {
  const items = { 'events:ok': { milestone: 'OK' } };

  t.true(is_valid_milestone_event('events:ok', { items_by_event_key: items }));
  t.false(is_valid_milestone_event('events:nope', { items_by_event_key: items }));
  t.false(is_valid_milestone_event(null, { items_by_event_key: items }));
});

test('register_first_of_event_notifications emits milestone event immediately for valid first events', (t) => {
  const env = create_env();
  register_first_of_event_notifications(env);

  env.events.emit('event_log:first', {
    first_of_event_key: 'sources:import_completed',
  });

  const milestone_events = env.emitted.filter((event) => event.event_key === 'milestones:first_achieved');

  t.is(milestone_events.length, 1);
  t.like(milestone_events[0].payload, {
    level: 'milestone',
    first_of_event_key: 'sources:import_completed',
    btn_callback: 'milestones_modal:open',
  });
});

test('register_first_of_event_notifications ignores duplicate first events for the same key', (t) => {
  const env = create_env();
  register_first_of_event_notifications(env);

  env.events.emit('event_log:first', {
    first_of_event_key: 'sources:import_completed',
  });
  env.events.emit('event_log:first', {
    first_of_event_key: 'sources:import_completed',
  });

  const milestone_events = env.emitted.filter((event) => event.event_key === 'milestones:first_achieved');
  t.is(milestone_events.length, 1);
});

test('register_first_of_event_notifications ignores non-checklist events', (t) => {
  const env = create_env();
  register_first_of_event_notifications(env);

  env.events.emit('event_log:first', {
    first_of_event_key: 'milestones:first_achieved',
  });

  const milestone_events = env.emitted.filter((event) => event.event_key === 'milestones:first_achieved');
  t.is(milestone_events.length, 0);
});

test('register_first_of_event_notifications returns a disposer', (t) => {
  const env = create_env();
  const dispose = register_first_of_event_notifications(env);

  dispose();
  env.events.emit('event_log:first', {
    first_of_event_key: 'sources:import_completed',
  });

  const milestone_events = env.emitted.filter((event) => event.event_key === 'milestones:first_achieved');
  t.is(milestone_events.length, 0);
});
