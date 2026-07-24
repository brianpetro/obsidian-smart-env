import test from 'ava';
import { context_add_items } from './add_items.js';

test('context_add_items returns false for missing or empty items', (t) => {
  const scope = {
    add_items() {
      t.fail('add_items should not be called');
    },
  };

  t.false(context_add_items.call(scope));
  t.false(context_add_items.call(scope, { items: [] }));
  t.false(context_add_items.call(scope, { items: 'A.md' }));
});

test('context_add_items delegates one complete batch and preserves the result', (t) => {
  const items = [
    'A.md',
    { key: 'A.md#Heading' },
  ];
  const expected_result = { accepted: 2 };
  let received_items = null;
  const scope = {
    add_items(next_items) {
      received_items = next_items;
      return expected_result;
    },
  };

  const result = context_add_items.call(scope, { items });

  t.is(received_items, items);
  t.is(result, expected_result);
});
