import test from 'ava';
import {
  item_matches_remove_path,
  normalize_remove_path,
  normalize_remove_targets,
} from './remove_path_utils.js';

test('normalize_remove_path removes trailing slashes', (t) => {
  t.is(normalize_remove_path('notes/folder///'), 'notes/folder');
  t.is(normalize_remove_path('notes/a.md'), 'notes/a.md');
  t.is(normalize_remove_path(null), '');
});

test('item_matches_remove_path matches exact paths, folders, blocks, and line refs', (t) => {
  t.true(item_matches_remove_path('notes/a.md', 'notes/a.md'));
  t.true(item_matches_remove_path('notes/folder/a.md', 'notes/folder'));
  t.true(item_matches_remove_path('notes/a.md#Heading', 'notes/a.md'));
  t.true(item_matches_remove_path('notes/a.md{1}', 'notes/a.md'));

  t.false(item_matches_remove_path('notes/a.md2#Heading', 'notes/a.md'));
  t.false(item_matches_remove_path('notes/folderish/a.md', 'notes/folder'));
  t.false(item_matches_remove_path('', 'notes/a.md'));
  t.false(item_matches_remove_path('notes/a.md', ''));
});

test('normalize_remove_targets dedupes and compresses child targets under parent targets', (t) => {
  const targets = normalize_remove_targets([
    'notes/a.md#Heading',
    'notes/a.md',
    'notes/b.md',
    'notes/b.md#Heading',
  ]);

  t.deepEqual(targets, [
    {
      path: 'notes/a.md',
      norm_key: 'notes/a.md',
      folder: false,
    },
    {
      path: 'notes/b.md',
      norm_key: 'notes/b.md',
      folder: false,
    },
  ]);
});

test('normalize_remove_targets supports object key/path inputs and shared folder flag', (t) => {
  const targets = normalize_remove_targets([
    { key: 'notes/folder/a.md' },
    { path: 'notes/folder/' },
  ], { folder: true });

  t.deepEqual(targets, [
    {
      path: 'notes/folder/',
      norm_key: 'notes/folder',
      folder: true,
    },
  ]);
});
