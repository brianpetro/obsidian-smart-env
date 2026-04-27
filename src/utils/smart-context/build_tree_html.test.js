import test from 'ava';
import { build_path_tree, build_tree_html } from './build_tree_html.js';

test('should create nested structure', t => {
  const items = [
    { path: 'foo/bar.md' },
    { path: 'foo/baz.md' }
  ];
  const tree = build_path_tree(items);
  t.truthy(tree.children.foo);
  t.truthy(tree.children.foo.children['bar.md']);
  t.truthy(tree.children.foo.children['baz.md']);
});

test('should omit redundant child paths', t => {
  const items = [
    { path: 'foo' },
    { path: 'foo/bar.md' }
  ];
  const tree = build_path_tree(items);
  t.true(tree.children.foo.selected);
  t.deepEqual(Object.keys(tree.children.foo.children), []);
});

test('should split by block key separator, keeping the preceding block separator(s)', t => {
  const items = [
    { path: 'foo/bar.md##baz#{1}' },
  ];
  const tree = build_path_tree(items);
  const top = tree.children['foo'];
  t.truthy(top);
  const next_1 = top.children['bar.md'];
  t.truthy(next_1);
  const next_2 = next_1.children['##baz'];
  t.truthy(next_2);
  const next_3 = next_2.children['#{1}'];
  t.truthy(next_3);
  t.is(next_3.children.length, 0);
});


test('should not split by forward slash contained in block key', t => {
  const items = [
    { path: 'foo/bar.md##baz / foobar#{1}' },
  ];
  const tree = build_path_tree(items);
  const top = tree.children['foo'];
  t.truthy(top);
  const next_1 = top.children['bar.md'];
  t.truthy(next_1);
  const next_2 = next_1.children['##baz / foobar'];
  t.truthy(next_2);
  const next_3 = next_2.children['#{1}'];
  t.truthy(next_3);
  t.is(next_3.children.length, 0);
});

test('should split single-hash block paths under the source file', t => {
  const items = [
    { path: 'PKM/Advanced/Habitual Reflection.md#Habitual Reflection#{1}' },
    { path: 'PKM/Advanced/Habitual Reflection.md' },
  ];
  const tree = build_path_tree(items);
  const advanced = tree.children.PKM.children.Advanced;
  const source = advanced.children['Habitual Reflection.md'];

  t.truthy(source);
  t.true(source.selected);
  t.truthy(source.children['Habitual Reflection']);
  t.is(source.children['Habitual Reflection'].path, 'PKM/Advanced/Habitual Reflection.md#Habitual Reflection');
  t.truthy(source.children['Habitual Reflection'].children['#{1}']);
  t.falsy(advanced.children['Habitual Reflection.md#Habitual Reflection']);
});

test('should strip preceding word characters followed by colon (e.g., "external:../")', t => {
  const items = [
    { path: 'external:../foo/bar.md' },
    { path: 'baz/boo.md' }
  ];
  const tree = build_path_tree(items);
  // Both should appear under 'foo'
  t.truthy(tree.children.baz);
  t.truthy(tree.children.foo.children['bar.md']);
  // Should not have a top-level 'external:' node
  t.falsy(tree.children['external:../foo']);
  t.falsy(tree.children['external:../']);
});

test('should split block paths without splitting slashes/hashtags inside wikilinks', t => {
  const items = [
    { path: 'main/file.md#heading link [[some/path.md#subpath]]' }
  ];
  const tree = build_path_tree(items);
  const source = tree.children.main.children['file.md'];

  t.truthy(source);
  t.truthy(source.children['heading link [[some/path.md#subpath]]']);
  t.is(Object.keys(tree.children.main.children).length, 1);
});

test('should add missing class when item does not exist', t => {
  const items = [
    { path: 'gone.md', exists: false }
  ];
  const html = build_tree_html(items);
  t.regex(html, /missing/, 'Missing items include sc-missing class');
});

