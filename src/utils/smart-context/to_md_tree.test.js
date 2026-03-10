import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'ava';
import { context_to_md_tree } from './to_md_tree.js';

function build_smart_context(keys = [], params = {}) {
  const item_data = params.item_data || {};
  return {
    context_items: {
      filter(predicate) {
        return keys
          .map((key) => ({ key, data: item_data[key] || {} }))
          .filter(predicate)
        ;
      },
    },
    ...(params.smart_context || {}),
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

test('context_to_md_tree resolves external links against the vault root path', (t) => {
  const vault_root_path = process.platform === 'win32'
    ? 'C:\\Users\\brian\\Documents\\vault'
    : '/Users/brian/Documents/vault'
  ;
  const external_href = pathToFileURL(
    path.resolve(vault_root_path, '../smartconnections.app/main/smart-chat.html')
  ).href;

  const smart_context = build_smart_context(
    [
      'external:../',
      'external:../smartconnections.app/main/smart-chat.html',
      'selection:daily/note.md',
    ],
    {
      item_data: {
        'external:../': { folder: true },
      },
      smart_context: {
        env: {
          plugin: {
            app: {
              vault: {
                adapter: {
                  getBasePath() {
                    return vault_root_path;
                  },
                },
              },
            },
          },
        },
      },
    },
  );

  t.is(
    context_to_md_tree(smart_context),
    [
      '- smartconnections.app',
      '\t- main',
      `\t\t- [smart-chat.html](${external_href})`,
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