import test from 'ava';
import { Modal } from 'obsidian';
import {
  env_export_data,
  menus,
} from './export_data.js';

function create_memory_fs() {
  return {
    files: {},
    writes: [],
    async write(file_path, content) {
      this.files[file_path] = content;
      this.writes.push({ method: 'write', file_path, content });
    },
    async append(file_path, content) {
      this.files[file_path] = (this.files[file_path] || '') + content;
      this.writes.push({ method: 'append', file_path, content });
    },
    async remove(file_path) {
      delete this.files[file_path];
      this.writes.push({ method: 'remove', file_path });
    },
  };
}

function create_env(params = {}) {
  const events = [];
  return {
    main: { app: {} },
    fs: params.fs || create_memory_fs(),
    events: {
      emit(event_key, event) {
        events.push({ event_key, event });
      },
    },
    smart_sources: params.smart_sources,
    smart_blocks: params.smart_blocks,
    emitted_events: events,
  };
}

function open_export_modal(env, params = {}) {
  const original_open = Modal.prototype.open;
  let modal = null;

  Modal.prototype.open = function open() {
    modal = this;
  };

  try {
    const opened = env_export_data.call(env, params);
    return {
      modal,
      opened,
    };
  } finally {
    Modal.prototype.open = original_open;
  }
}

test.serial('configured action owns modal, single-file chunked export, progress, and completion lifecycle', async (t) => {
  const env = create_env({
    smart_sources: {
      items: {
        first: { data: { key: 'first', text: 'A'.repeat(600_000) } },
        second: { data: { key: 'second', text: 'B'.repeat(600_000) } },
      },
    },
    smart_blocks: {
      items: {
        block: { data: { key: 'block', text: 'Block content' } },
      },
    },
  });
  const { modal, opened } = open_export_modal(env, {
    event_source: 'menu:env:status_bar_menu:env_export_data',
  });

  t.true(opened);
  t.truthy(modal);

  const result = await modal.run_export();

  t.regex(
    result.file_path,
    /^smart-env-export-\d{4}-\d{2}-\d{2}T.*\.json$/,
  );
  t.false(result.file_path.includes(':'));
  t.is(result.item_count, 3);
  t.is(result.collection_count, 2);
  t.is(Object.keys(env.fs.files).length, 1);
  t.deepEqual(
    JSON.parse(env.fs.files[result.file_path]),
    {
      smart_sources: {
        items: [
          { key: 'first', text: 'A'.repeat(600_000) },
          { key: 'second', text: 'B'.repeat(600_000) },
        ],
      },
      smart_blocks: {
        items: [
          { key: 'block', text: 'Block content' },
        ],
      },
    },
  );
  t.true(env.fs.writes.some((write) => write.method === 'append'));
  t.is(env.export_progress_state, null);
  t.is(
    env.emitted_events.filter(({ event_key }) => {
      return event_key === 'smart_env:export_progress';
    }).length,
    2,
  );
  t.true(env.emitted_events.some(({ event_key, event }) => {
    return event_key === 'smart_env:exported'
      && event.event_source === 'menu:env:status_bar_menu:env_export_data'
      && event.file_path === result.file_path
    ;
  }));
});

test.serial('modal renders export progress as a bar without numeric status text', (t) => {
  const env = create_env({
    smart_blocks: {
      items: {},
    },
  });
  const { modal } = open_export_modal(env);
  const progress_attributes = {};
  let status = '';

  modal.status_el = {
    setText(value) {
      status = value;
    },
  };
  modal.progress_el = {
    hidden: true,
    value: 0,
    setAttribute(key, value) {
      progress_attributes[key] = String(value);
    },
    removeAttribute(key) {
      delete progress_attributes[key];
    },
  };

  modal.render_progress({
    active: true,
    collection_key: 'smart_blocks',
    progress: 25,
    total: 100,
  });

  t.is(status, 'Exporting Blocks...');
  t.false(status.includes('25/100'));
  t.false(modal.progress_el.hidden);
  t.is(modal.progress_el.value, 25);
  t.is(progress_attributes['aria-valuenow'], '25');
});

test.serial('embedding vectors are omitted by default and added when selected', async (t) => {
  function create_vector_env() {
    let load_vectors_call_count = 0;
    const env = create_env({
      smart_sources: {
        embeddings: {
          async load_vectors() {
            load_vectors_call_count += 1;
          },
        },
        items: {
          source: {
            data: {
              key: 'source',
              embeddings: {
                legacy: {
                  vec: [9, 9],
                  hash: 'legacy',
                },
              },
            },
            vec: new Float32Array([1, 2, 3]),
          },
        },
      },
    });
    env.load_vectors_call_count = () => load_vectors_call_count;
    return env;
  }

  const without_vectors_env = create_vector_env();
  const without_vectors_modal = open_export_modal(without_vectors_env).modal;
  const without_vectors_result = await without_vectors_modal.run_export();
  const without_vectors = JSON.parse(
    without_vectors_env.fs.files[without_vectors_result.file_path],
  );

  t.false('vec' in without_vectors.smart_sources.items[0]);
  t.false('vec' in without_vectors.smart_sources.items[0].embeddings.legacy);
  t.is(without_vectors_env.load_vectors_call_count(), 0);

  const with_vectors_env = create_vector_env();
  const with_vectors_modal = open_export_modal(with_vectors_env).modal;
  with_vectors_modal.include_vectors = true;
  const with_vectors_result = await with_vectors_modal.run_export();
  const with_vectors = JSON.parse(
    with_vectors_env.fs.files[with_vectors_result.file_path],
  );

  t.deepEqual(with_vectors.smart_sources.items[0].vec, [1, 2, 3]);
  t.deepEqual(with_vectors.smart_sources.items[0].embeddings.legacy.vec, [9, 9]);
  t.is(with_vectors_env.load_vectors_call_count(), 1);
});

test.serial('adapter write path removes a partially written file after append failure', async (t) => {
  const files = {};
  const calls = [];
  const fs = {
    async write() {
      t.fail('SmartFs write wrapper should not be used when the adapter is available.');
    },
    async append() {
      t.fail('SmartFs append wrapper should not be used when the adapter is available.');
    },
    adapter: {
      async write(file_path, content) {
        files[file_path] = content;
        calls.push({ method: 'write', file_path });
      },
      async append() {
        calls.push({ method: 'append' });
        throw new Error('append failed');
      },
      async remove(file_path) {
        calls.push({ method: 'remove', file_path });
        delete files[file_path];
      },
    },
  };
  const env = create_env({
    fs,
    smart_sources: {
      items: {
        first: { data: { key: 'first', text: 'A'.repeat(600_000) } },
        second: { data: { key: 'second', text: 'B'.repeat(600_000) } },
      },
    },
  });
  const { modal } = open_export_modal(env);
  const original_console_error = console.error;
  console.error = () => {};

  try {
    t.false(await modal.run_export());
  } finally {
    console.error = original_console_error;
  }

  t.deepEqual(calls.map(({ method }) => method), [
    'write',
    'append',
    'remove',
  ]);
  t.deepEqual(files, {});
  t.is(env.export_progress_state, null);
  t.true(env.emitted_events.some(({ event_key, event }) => {
    return event_key === 'smart_env:export_failed'
      && event.details.includes('append failed')
    ;
  }));
});

test.serial('action and menu reject another export while one is active', (t) => {
  const env = create_env({
    smart_sources: { items: {} },
  });
  env.export_progress_state = {
    active: true,
  };

  t.false(env_export_data.call(env));
  t.true(
    menus['env:status_bar_menu'].disabled.call({
      scope: env,
    }),
  );
});
