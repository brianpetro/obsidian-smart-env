import test from 'ava';
import { get_nested_context_item_keys } from './tree_utils.js';

const build_ctx = (keys = []) => ({
  context_items: keys.map((key) => ({ key }))
});

test('get_nested_context_item_keys returns descendants for folder targets', (t) => {
  const ctx = build_ctx([
    'folder/file.md',
    'folder/nested/child.md',
    'other.md'
  ]);

  const result = get_nested_context_item_keys(ctx, { target_path: 'folder' }).sort();

  t.deepEqual(result, ['folder/file.md', 'folder/nested/child.md']);
});

test('get_nested_context_item_keys includes block keys for file targets', (t) => {
  const ctx = build_ctx([
    'folder/file.md',
    'folder/file.md##Heading#{1}',
    'folder/other.md'
  ]);

  const result = get_nested_context_item_keys(ctx, { target_path: 'folder/file.md' }).sort();

  t.deepEqual(result, ['folder/file.md', 'folder/file.md##Heading#{1}']);
});

test('get_nested_context_item_keys ignores empty targets', (t) => {
  const ctx = build_ctx(['folder/file.md']);

  const result = get_nested_context_item_keys(ctx, { target_path: '' });

  t.deepEqual(result, []);
});
