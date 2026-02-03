import test from 'ava';

import {
  dequeue_event_key,
  enqueue_event_key,
  get_idle_delay_ms,
  is_valid_milestone_event,
} from './onboarding_events_utils.js';

test('get_idle_delay_ms returns remaining idle delay', (t) => {
  t.is(get_idle_delay_ms({ last_input_at: 1000, now: 2500, idle_delay_ms: 3000 }), 1500);
  t.is(get_idle_delay_ms({ last_input_at: 1000, now: 4500, idle_delay_ms: 3000 }), 0);
});

test('enqueue_event_key appends to the queue without mutating', (t) => {
  const queue = ['a'];
  const next_queue = enqueue_event_key(queue, { event_key: 'b' });

  t.deepEqual(queue, ['a']);
  t.deepEqual(next_queue, ['a', 'b']);
});

test('dequeue_event_key returns head and rest', (t) => {
  const queue = ['a', 'b'];
  const result = dequeue_event_key(queue);

  t.is(result.event_key, 'a');
  t.deepEqual(result.queue, ['b']);
  t.is(dequeue_event_key([]).event_key, null);
});

test('is_valid_milestone_event checks map membership', (t) => {
  const items = { 'events:ok': { milestone: 'OK' } };

  t.true(is_valid_milestone_event('events:ok', { items_by_event_key: items }));
  t.false(is_valid_milestone_event('events:nope', { items_by_event_key: items }));
  t.false(is_valid_milestone_event(null, { items_by_event_key: items }));
});
