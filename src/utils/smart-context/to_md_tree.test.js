import test from 'ava';
import { context_to_md_tree } from './context_to_md_tree.js';

function build_smart_context(keys = []) {
  return {
    context_items: {
      filter(predicate) {
        return keys
          .map((key) => ({ key, data: {} }))
          .filter(predicate)
        ;
      },
    },
  };
}

test('context_to_md_tree builds a nested wikilink tree from context_items', (t) => {
  const smart_context = build_smart_context([
    'projects/spec.md',
    'projects/notes/meeting.md',
    'inbox.md',
    'assets/diagram.png',
    'projects/spec.md#Overview',
  ]);

  t.is(
    context_to_md_tree(smart_context),
    [
      '- projects',
      '\t- [[spec]]',
      '\t- notes',
      '\t\t- [[meeting]]',
      '\t- [[spec#Overview]]',
      '- [[inbox]]',
      '- assets',
      '\t- [[diagram.png]]',
    ].join('\n')
  );
});

test('context_to_md_tree strips external and selection prefixes', (t) => {
  const smart_context = build_smart_context([
    'external:../vault/spec.md',
    'selection:daily/note.md',
  ]);

  t.is(
    context_to_md_tree(smart_context),
    [
      '- ..',
      '\t- vault',
      '\t\t- [[spec]]',
      '- daily',
      '\t- [[note]]',
    ].join('\n')
  );
});

test('context_to_md_tree supports folder items and skips excluded raw context_items', (t) => {
  const smart_context = {
    data: {
      context_items: {
        'research/': { folder: true },
        'research/plan.md': {},
        'research/ignore.md': { exclude: true },
      },
    },
  };

  t.is(
    context_to_md_tree(smart_context),
    [
      '- research',
      '\t- [[plan]]',
    ].join('\n')
  );
});