import test from 'ava';

import {
  get_nested_context_item_keys,
} from './tree_utils.js';

const ctx = {
  data: {
    context_items: {
      'folder/file.md': {},
      'folder/file.md#Heading': {},
      'folder/nested/other.md': {},
      'folder/ignored.md': { exclude: true },
      'external:../repo/src/index.js': {},
      'external:../repo/src/index.js#Main': {},
    },
  },
};

test('get_nested_context_item_keys returns descendants for folders', (t) => {
  const keys = get_nested_context_item_keys(ctx, { target_path: 'folder' });

  t.deepEqual(keys, [
    'folder/file.md#Heading',
    'folder/nested/other.md',
    'folder/file.md',
  ]);
});

test('get_nested_context_item_keys returns descendants for files and blocks', (t) => {
  t.deepEqual(get_nested_context_item_keys(ctx, { target_path: 'folder/file.md' }), [
    'folder/file.md#Heading',
    'folder/file.md',
  ]);

  t.deepEqual(get_nested_context_item_keys(ctx, { target_path: 'external:../repo/src' }), [
    'external:../repo/src/index.js#Main',
    'external:../repo/src/index.js',
  ]);
});

test('get_nested_context_item_keys excludes excluded items unless requested', (t) => {
  t.false(get_nested_context_item_keys(ctx, { target_path: 'folder' }).includes('folder/ignored.md'));
  t.true(get_nested_context_item_keys(ctx, {
    target_path: 'folder',
    include_excluded: true,
  }).includes('folder/ignored.md'));
});
