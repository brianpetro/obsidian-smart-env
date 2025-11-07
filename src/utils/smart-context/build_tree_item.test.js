import test from 'ava';
import { build_tree_item } from './build_tree_item.js';

test('build_tree_item adds controls for selected paths', t => {
  const selected_paths = new Set(['foo/bar.md']);
  const html = build_tree_item({ path: 'foo/bar.md', name: 'bar.md', is_file: true }, selected_paths);
  t.true(html.includes('sc-tree-remove'));
  t.true(html.includes('sc-tree-label'));
});
