import test from 'ava';
import { build_path_tree } from './build_path_tree.js';

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
    { path: 'foo', kind: 'folder', folder: true },
    { path: 'foo/bar.md' }
  ];
  const tree = build_path_tree(items);
  t.true(tree.children.foo.selected);
  t.deepEqual(Object.keys(tree.children.foo.children), []);
});

test('should nest final block refs under their prior heading label', t => {
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
  t.is(next_3.path, 'foo/bar.md##baz#{1}');
  t.deepEqual(Object.keys(next_3.children), []);
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
  t.deepEqual(Object.keys(next_3.children), []);
});

test('should nest single-hash line refs under the prior heading label', t => {
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
  t.is(source.children['Habitual Reflection'].children['#{1}'].path, 'PKM/Advanced/Habitual Reflection.md#Habitual Reflection#{1}');
  t.falsy(advanced.children['Habitual Reflection.md#Habitual Reflection']);
});

test('should preserve parent headings while nesting leaf block refs', t => {
  const items = [
    { path: 'notes/a.md#Parent#Child#{1}' },
  ];
  const tree = build_path_tree(items);
  const notes = tree.children.notes;
  const source = notes.children['a.md'];

  t.is(notes.kind, 'folder');
  t.is(source.kind, 'source');
  t.truthy(source.children.Parent);
  t.is(source.children.Parent.kind, 'block');
  t.truthy(source.children.Parent.children.Child);
  t.is(source.children.Parent.children.Child.kind, 'block');
  t.truthy(source.children.Parent.children.Child.children['#{1}']);
  t.is(source.children.Parent.children.Child.children['#{1}'].kind, 'block');
  t.is(source.children.Parent.children.Child.children['#{1}'].path, 'notes/a.md#Parent#Child#{1}');
});

test('should keep selected parent blocks open for nested selections regardless of insertion order', t => {
  const item_orders = [
    [
      { path: 'notes/a.md#Parent' },
      { path: 'notes/a.md#Parent#{1}' },
    ],
    [
      { path: 'notes/a.md#Parent#{1}' },
      { path: 'notes/a.md#Parent' },
    ],
  ];

  item_orders.forEach((items) => {
    const tree = build_path_tree(items);
    const parent = tree.children.notes.children['a.md'].children.Parent;

    t.true(parent.selected);
    t.true(parent.is_file);
    t.false(Array.isArray(parent.children));
    t.truthy(parent.children['#{1}']);
    t.is(parent.children['#{1}'].path, 'notes/a.md#Parent#{1}');
  });
});

test('should render the root block separately from sibling sections in the same source', t => {
  const tree = build_path_tree([
    { path: 'notes/a.md#' },
    { path: 'notes/a.md#Heading' },
    { path: 'notes/a.md#Other' },
  ]);
  const source = tree.children.notes.children['a.md'];

  t.is(source.path, 'notes/a.md');
  t.false(source.selected);
  t.false(Array.isArray(source.children));
  t.is(source.children['#'].path, 'notes/a.md#');
  t.is(source.children.Heading.path, 'notes/a.md#Heading');
  t.is(source.children.Other.path, 'notes/a.md#Other');
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

test('should use explicit kind for extensionless sources and file-like folders', t => {
  const items = [
    {
      key: 'README',
      kind: 'source',
      source_path: 'README',
    },
    {
      key: 'archive.md',
      kind: 'folder',
      folder: true,
      source_path: 'archive.md',
    },
    {
      key: 'archive.md/note',
      kind: 'source',
      source_path: 'archive.md/note',
    },
  ];
  const tree = build_path_tree(items);

  t.true(tree.children.README.is_file);
  t.false(tree.children['archive.md'].is_file);
  t.true(tree.children['archive.md'].selected);
  t.deepEqual(Object.keys(tree.children['archive.md'].children), []);
});

test('should render explicit source and subpath metadata', t => {
  const items = [
    {
      key: 'notes/a.md#Heading#{1}',
      kind: 'block',
      source_path: 'notes/a.md',
      subpath: 'Heading#{1}',
    },
  ];
  const tree = build_path_tree(items);
  const block = tree.children.notes.children['a.md'].children.Heading.children['#{1}'];

  t.truthy(block);
  t.is(block.path, 'notes/a.md#Heading#{1}');
});

test('should hide every leading external traversal segment while preserving item identity', t => {
  const items = [
    {
      key: 'external:../../repo/README',
      kind: 'source',
      source_path: '../../repo/README',
      is_external: true,
    },
  ];
  const tree = build_path_tree(items);
  const source = tree.children.repo.children.README;

  t.truthy(source);
  t.is(source.path, 'external:../../repo/README');
  t.falsy(tree.children['..']);
});

test('should preserve object-prototype path segments', t => {
  const tree = build_path_tree([
    {
      key: '__proto__/constructor',
      kind: 'source',
      source_path: '__proto__/constructor',
    },
  ]);

  t.truthy(tree.children['__proto__']);
  t.truthy(tree.children['__proto__'].children.constructor);
  t.is(Object.getPrototypeOf(tree.children), null);
});
