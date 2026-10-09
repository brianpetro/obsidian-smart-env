import test from 'ava';
import { SmartFs } from 'smart-file-system';
import { ObsidianFsAdapter } from './obsidian.js';

class TestFile {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop();
    this.basename = this.name.split('.').shift();
    this.extension = this.name.split('.').pop();
    this.stat = { ctime: 0, mtime: 0, size: 1 };
  }
}

class TestFolder {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop();
  }
}

const configured_excluded_long_path = [
  'Cases/Lastname, Firstname',
  'Doe v. X, 193 S.W.3d 727, 727 (Tex. App. 2006), review granted',
  'x'.repeat(160) + '.md',
].join('/');

const included_long_path = [
  'Other Cases',
  'Roe v. Y, 200 S.W.3d 100, 101 (Tex. App. 2007)',
  'y'.repeat(160) + '.md',
].join('/');

const runtime_long_path = `Runtime/${'z'.repeat(220)}.md`;
const included_comma_path = 'Cases/Other/Doe v. X, 193 S.W.3d 727, 727 (Tex. App. 2006).md';

test('core includes long paths while preserving configured exclusions', async (t) => {
  const vault_files = [
    new TestFolder('Cases'),
    new TestFolder('Cases/Lastname, Firstname'),
    new TestFile(configured_excluded_long_path),
    new TestFile(included_long_path),
    new TestFile(included_comma_path),
  ];
  const app = {
    vault: {
      adapter: {},
      getAllLoadedFiles() {
        return vault_files;
      },
    },
  };
  const env = {
    main: { app },
    settings: {
      gitignore_exclusions: [],
      skip_excluding_gitignore: true,
    },
  };
  const smart_fs = new SmartFs(env, {
    adapter: ObsidianFsAdapter,
    exclude_patterns: ['Cases/Lastname, Firstname/**'],
  });
  smart_fs.adapter.obsidian = { TFile: TestFile, TFolder: TestFolder };

  await smart_fs.load_files();

  t.true(smart_fs.file_paths.includes(included_long_path));
  t.true(smart_fs.file_paths.includes(included_comma_path));
  t.false(smart_fs.file_paths.includes(configured_excluded_long_path));
  t.false(smart_fs.is_excluded(runtime_long_path));
  t.deepEqual(smart_fs.auto_excluded_files, []);
});

class PathLengthLimitObsidianFsAdapter extends ObsidianFsAdapter {
  should_exclude_path_for_length(file_path) {
    return file_path.length > 200;
  }
}

test('SmartFs honors an adapter path-length policy override', async (t) => {
  const long_path = `Long/${'q'.repeat(220)}.md`;
  const vault_files = [new TestFile(long_path)];
  const app = {
    vault: {
      adapter: {},
      getAllLoadedFiles() {
        return vault_files;
      },
    },
  };
  const env = {
    main: { app },
    settings: {
      gitignore_exclusions: [],
      skip_excluding_gitignore: true,
    },
  };
  const smart_fs = new SmartFs(env, {
    adapter: PathLengthLimitObsidianFsAdapter,
  });
  smart_fs.adapter.obsidian = { TFile: TestFile, TFolder: TestFolder };

  await smart_fs.load_files();

  t.false(smart_fs.file_paths.includes(long_path));
  t.true(smart_fs.is_excluded(long_path));
  t.deepEqual(smart_fs.auto_excluded_files, [long_path]);
});

function create_event_target() {
  const listeners = new Map();
  return {
    listeners,
    on(event_key, handler) {
      if (!listeners.has(event_key)) listeners.set(event_key, new Set());
      listeners.get(event_key).add(handler);
      return { event_key, handler };
    },
    trigger(event_key, ...args) {
      listeners.get(event_key)?.forEach(handler => handler(...args));
    },
  };
}

function create_source_watcher_fixture() {
  const vault = { adapter: {}, ...create_event_target() };
  const workspace = create_event_target();
  const registered_events = [];
  const emitted_events = [];
  const env = {
    main: {
      app: { vault, workspace },
      registerEvent(event_ref) {
        registered_events.push(event_ref);
      },
    },
    events: {
      emit(event_key, payload) {
        emitted_events.push({ event_key, payload });
      },
    },
  };
  const smart_fs = new SmartFs(env, { adapter: ObsidianFsAdapter });
  return {
    adapter: smart_fs.adapter,
    env,
    vault,
    workspace,
    registered_events,
    emitted_events,
    sources_collection: { collection_key: 'smart_sources' },
  };
}

test('source watchers register vault listeners once without an editor-change listener', (t) => {
  const { adapter, vault, workspace, registered_events, sources_collection } = create_source_watcher_fixture();

  t.true(adapter.register_source_watchers(sources_collection));
  t.true(adapter.register_source_watchers(sources_collection));

  t.deepEqual([...vault.listeners.keys()], ['create', 'modify', 'rename', 'delete']);
  t.is(registered_events.length, 4);
  t.is(workspace.listeners.size, 0);
  for (const [event_key, handlers] of vault.listeners) {
    t.is(handlers.size, 1);
    t.true(registered_events.some(event_ref => event_ref.event_key === event_key
      && handlers.has(event_ref.handler)));
  }
});

test('a typing burst followed by a save emits only the vault modification', (t) => {
  const { adapter, vault, workspace, emitted_events, sources_collection } = create_source_watcher_fixture();
  const file = new TestFile('Notes/Typing.md');
  adapter.register_source_watchers(sources_collection);

  for (let change_i = 0; change_i < 100; change_i++) {
    workspace.trigger('editor-change', {}, { file });
  }
  vault.trigger('modify', file);

  t.deepEqual(emitted_events, [{
    event_key: 'sources:modified',
    payload: {
      collection_key: 'smart_sources',
      item_key: file.path,
      path: file.path,
      event_source: 'obsidian:vault.modify',
    },
  }]);
});

test('unsaved editor changes do not invalidate filesystem-backed sources', (t) => {
  const { adapter, workspace, emitted_events, sources_collection } = create_source_watcher_fixture();
  const file = new TestFile('Notes/Unsaved.md');
  adapter.register_source_watchers(sources_collection);

  workspace.trigger('editor-change', {}, { file });
  workspace.trigger('editor-change', {}, {});
  workspace.trigger('editor-change', {}, null);

  t.deepEqual(emitted_events, []);
});

test('interleaved editor changes do not amplify repeated saves', (t) => {
  const { adapter, vault, workspace, emitted_events, sources_collection } = create_source_watcher_fixture();
  const file = new TestFile('Notes/Repeated.md');
  adapter.register_source_watchers(sources_collection);

  for (let save_i = 0; save_i < 20; save_i++) {
    workspace.trigger('editor-change', {}, { file });
    file.stat.mtime = save_i + 1;
    vault.trigger('modify', file);
    workspace.trigger('editor-change', {}, { file });
  }

  t.is(emitted_events.length, 20);
  t.true(emitted_events.every(event => event.event_key === 'sources:modified'
    && event.payload.path === file.path
    && event.payload.event_source === 'obsidian:vault.modify'));
});

test('every vault modification is forwarded even when file stats are unchanged', (t) => {
  const { adapter, vault, emitted_events, sources_collection } = create_source_watcher_fixture();
  const first_file = new TestFile('Notes/First.md');
  const second_file = new TestFile('Notes/Second.md');
  adapter.register_source_watchers(sources_collection);

  vault.trigger('modify', first_file);
  vault.trigger('modify', second_file);
  vault.trigger('modify', first_file);

  t.deepEqual(emitted_events.map(event => event.payload.path), [
    first_file.path, second_file.path, first_file.path,
  ]);
  t.true(emitted_events.every(event => event.event_key === 'sources:modified'));
});

test('vault modifications require neither an editor nor a Markdown extension', (t) => {
  const { adapter, env, vault, emitted_events, sources_collection } = create_source_watcher_fixture();
  delete env.main.app.workspace;
  t.true(adapter.register_source_watchers(sources_collection));
  const file_paths = ['Closed.md', 'Board.canvas', 'Catalog.base', 'Drawing.excalidraw.md', 'Image.png'];

  for (const file_path of file_paths) {
    vault.trigger('modify', new TestFile(file_path));
  }

  t.deepEqual(emitted_events, file_paths.map(path => ({
    event_key: 'sources:modified',
    payload: {
      collection_key: 'smart_sources',
      item_key: path,
      path,
      event_source: 'obsidian:vault.modify',
    },
  })));
});

for (const [vault_event, source_event] of [
  ['create', 'sources:created'],
  ['rename', 'sources:renamed'],
  ['delete', 'sources:deleted'],
]) {
  test(`vault ${vault_event} preserves source lifecycle payloads for files and folders`, (t) => {
    const { adapter, vault, emitted_events, sources_collection } = create_source_watcher_fixture();
    const entries = [new TestFile('Notes/Current.md'), new TestFolder('Notes/Current')];
    adapter.register_source_watchers(sources_collection);

    for (const entry of entries) {
      vault.trigger(vault_event, entry, `Old/${entry.name}`);
    }

    t.deepEqual(emitted_events, entries.map(entry => ({
      event_key: source_event,
      payload: {
        collection_key: 'smart_sources',
        item_key: entry.path,
        path: entry.path,
        ...(vault_event === 'rename' ? { old_path: `Old/${entry.name}` } : {}),
        event_source: `obsidian:vault.${vault_event}`,
      },
    })));
  });
}

test('source watchers remain safe when the optional environment event bus is absent', (t) => {
  const { adapter, env, vault, emitted_events, sources_collection } = create_source_watcher_fixture();
  delete env.events;
  adapter.register_source_watchers(sources_collection);
  const file = new TestFile('Notes/No-bus.md');

  t.notThrows(() => {
    vault.trigger('create', file);
    vault.trigger('modify', file);
    vault.trigger('rename', file, 'Notes/Old.md');
    vault.trigger('delete', file);
  });
  t.deepEqual(emitted_events, []);
});
