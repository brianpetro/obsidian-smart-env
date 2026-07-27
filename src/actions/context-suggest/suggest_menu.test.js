import test from 'ava';
import {
  display_description as sources_description,
  menus as sources_menus,
} from './sources.js';
import {
  display_description as blocks_description,
  menus as blocks_menus,
} from './blocks.js';
import {
  display_description as contexts_description,
  menus as contexts_menus,
} from './contexts.js';

const suggest_menu_key = 'smart_context:suggest';

test('Core suggest actions explicitly place their Builder source tabs', (t) => {
  t.deepEqual(sources_menus[suggest_menu_key], {
    title: 'Notes',
    icon: 'file-text',
    order: 0,
  });
  t.deepEqual(blocks_menus[suggest_menu_key], {
    title: 'Sections',
    icon: 'heading',
    order: 20,
  });
  t.deepEqual(contexts_menus[suggest_menu_key], {
    title: 'Named contexts',
    icon: 'smart-named-contexts',
    order: 30,
  });
  t.truthy(sources_description);
  t.truthy(blocks_description);
  t.truthy(contexts_description);
});
