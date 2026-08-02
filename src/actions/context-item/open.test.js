import test from 'ava';
import { menus } from './open.js';

test('Open item menu defers to the source menu for source-backed items', (t) => {
  const menu_spec = menus['context_item:action_menu'];

  t.true(menu_spec.when.call({ scope: { item_ref: null } }));
  t.false(menu_spec.when.call({
    scope: {
      item_ref: { key: 'Notes/Plan.md' },
    },
  }));
});
