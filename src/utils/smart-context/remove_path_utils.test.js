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

for (const folder_first of [false, true]) {
  test(`normalize_remove_targets preserves duplicate folder flags with folder first: ${folder_first}`, (t) => {
    const weak_target = { path: ' notes/branch/// ' };
    const folder_target = { key: 'notes/branch', folder: true };
    const items = folder_first ? [folder_target, weak_target] : [weak_target, folder_target];

    t.deepEqual(normalize_remove_targets(items), [{
      path: folder_first ? 'notes/branch' : 'notes/branch///',
      norm_key: 'notes/branch',
      folder: true,
    }]);
    t.deepEqual(weak_target, { path: ' notes/branch/// ' });
    t.deepEqual(folder_target, { key: 'notes/branch', folder: true });
  });
}

test('normalize_remove_targets merges duplicate parents while compressing descendant targets', (t) => {
  const targets = [
    'notes/branch/a.md#Heading',
    'notes/branch/',
    { key: 'notes/branch', folder: true },
    'notes/branch/b.md{1}',
  ];
  for (const items of [targets, [...targets].reverse()]) {
    const normalized = normalize_remove_targets(items);
    t.is(normalized.length, 1);
    t.is(normalized[0].norm_key, 'notes/branch');
    t.true(normalized[0].folder);
  }
});

test('normalize_remove_targets keeps external identities and source boundaries distinct', (t) => {
  const targets = normalize_remove_targets([
    'notes/a.md#Heading',
    'notes/a.md{1}',
    'notes/a.md',
    'notes/a.md2',
    'external:notes/a.md#Heading',
    { key: 'external:notes/a.md' },
    'external:../notes/a.md',
  ]);

  t.deepEqual(targets.map((target) => target.norm_key), [
    'notes/a.md',
    'notes/a.md2',
    'external:notes/a.md',
    'external:../notes/a.md',
  ]);
  t.false(item_matches_remove_path('notes/a.md', 'external:notes/a.md'));
  t.false(item_matches_remove_path('external:notes/a.md', 'notes/a.md'));
});
