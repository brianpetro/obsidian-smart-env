import test from 'ava';
import { context_to_md_tree } from './to_md_tree.js';

function file_href_from_absolute_path(absolute_path = '') {
  const normalized_path = String(absolute_path).replace(/\\+/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized_path)) {
    return `file:///${encodeURI(normalized_path)}`;
  }
  return `file://${encodeURI(normalized_path)}`;
}

function resolve_external_file_href(vault_root_path, normalized_path = '') {
  const base_href = file_href_from_absolute_path(vault_root_path);
  const directory_href = base_href.endsWith('/')
    ? base_href
    : `${base_href}/`
  ;
  return new URL(normalized_path, directory_href).href;
}

function resolve_external_full_path(vault_root_path, normalized_path = '') {
  const href = resolve_external_file_href(vault_root_path, normalized_path);
  const pathname = decodeURIComponent(new URL(href).pathname);
  if (/^\/[a-zA-Z]:\//.test(pathname)) {
    return pathname.slice(1);
  }
  return pathname;
}

function build_filesystem_adapter(vault_root_path, params = {}) {
  return {
    ...(params.methods || {}),
    getBasePath: params.include_base_path === false
      ? undefined
      : (() => vault_root_path),
    getFilePath: params.include_file_path === false
      ? undefined
      : ((normalized_path) => resolve_external_file_href(vault_root_path, normalized_path)),
    getFullPath: params.include_full_path === false
      ? undefined
      : ((normalized_path) => resolve_external_full_path(vault_root_path, normalized_path)),
  };
}

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

test('context_to_md_tree resolves external links with adapter.getFilePath when available', (t) => {
  const vault_root_path = process.platform === 'win32'
    ? 'C:\\Users\\brian\\Documents\\vault'
    : '/Users/brian/Documents/vault'
  ;
  const external_href = resolve_external_file_href(
    vault_root_path,
    '../smartconnections.app/main/smart-chat.html'
  );

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
                adapter: build_filesystem_adapter(vault_root_path),
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

test('context_to_md_tree falls back to adapter.getFullPath for external links', (t) => {
  const vault_root_path = process.platform === 'win32'
    ? 'C:\\Users\\brian\\Documents\\vault'
    : '/Users/brian/Documents/vault'
  ;
  const readme_href = resolve_external_file_href(
    vault_root_path,
    '../smartconnections.app/README.md'
  );

  const smart_context = build_smart_context(
    [
      'external:../smartconnections.app/README.md',
    ],
    {
      smart_context: {
        env: {
          plugin: {
            app: {
              vault: {
                adapter: build_filesystem_adapter(vault_root_path, {
                  include_file_path: false,
                }),
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
      `\t- [README.md](${readme_href})`,
    ].join('\n')
  );
});

test('context_to_md_tree keeps expanded external-folder files as file links', (t) => {
  const vault_root_path = process.platform === 'win32'
    ? 'C:\\Users\\brian\\Documents\\vault'
    : '/Users/brian/Documents/vault'
  ;
  const smart_chat_href = resolve_external_file_href(
    vault_root_path,
    '../smartconnections.app/main/smart-chat.html'
  );
  const readme_href = resolve_external_file_href(
    vault_root_path,
    '../smartconnections.app/README.md'
  );

  const smart_context = build_smart_context(
    [
      'external:../smartconnections.app/main/smart-chat.html',
      'external:../smartconnections.app/README.md',
    ],
    {
      item_data: {
        'external:../smartconnections.app/main/smart-chat.html': {
          folder: '../smartconnections.app',
        },
        'external:../smartconnections.app/README.md': {
          folder: '../smartconnections.app',
        },
      },
      smart_context: {
        env: {
          plugin: {
            app: {
              vault: {
                adapter: build_filesystem_adapter(vault_root_path),
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
      `\t\t- [smart-chat.html](${smart_chat_href})`,
      `\t- [README.md](${readme_href})`,
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
