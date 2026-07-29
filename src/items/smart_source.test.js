import test from 'ava';
import { create_actions_proxy } from 'smart-collections/utils/create_actions_proxy.js';
import { SmartSource as CoreSmartSource } from 'smart-sources/smart_source.js';
import { SmartSource } from './smart_source.js';

test('get_embed_input inherits the strict core source contract', async t => {
  t.false(Object.hasOwn(SmartSource.prototype, 'get_embed_input'));
  t.is(
    SmartSource.prototype.get_embed_input,
    CoreSmartSource.prototype.get_embed_input,
  );

  const action_key = 'source_get_embed_input_markdown';
  const source_adapter = { embed_input_action_key: action_key };
  let unused_reads = 0;
  const configured_actions = {
    [action_key]: {
      async action(params) {
        t.is(this, source);
        t.deepEqual(params, { content: 'content' });
        t.is(this.source_adapter, source_adapter);
        return 'delegated input';
      },
    },
  };
  Object.defineProperty(configured_actions, 'unused_action', {
    enumerable: true,
    get() {
      unused_reads += 1;
      return { action() {} };
    },
  });

  const source = {
    key: 'Notes/Test.md',
    source_adapter,
  };
  Object.defineProperty(source, 'actions', {
    get() {
      if (!this._actions) {
        this._actions = create_actions_proxy(this, [configured_actions]);
      }
      return this._actions;
    },
  });

  const result = await SmartSource.prototype.get_embed_input.call(source, 'content');

  t.is(result, 'delegated input');
  t.is(unused_reads, 0);
  t.truthy(source._actions);
});

test('get_embed_input rejects a missing source adapter action key', async t => {
  let actions_accessed = false;
  const source = {
    key: 'Notes/Test.md',
    source_adapter: {},
  };
  Object.defineProperty(source, 'actions', {
    get() {
      actions_accessed = true;
      return {};
    },
  });

  const error = await t.throwsAsync(
    SmartSource.prototype.get_embed_input.call(source, 'content'),
  );

  t.is(
    error.message,
    'SmartSource.get_embed_input: missing embed_input_action_key for Notes/Test.md',
  );
  t.false(actions_accessed);
});

test('get_embed_input rejects a missing configured source action', async t => {
  const action_key = 'source_get_embed_input_markdown';
  const source = {
    key: 'Notes/Test.md',
    source_adapter: { embed_input_action_key: action_key },
  };
  source.actions = create_actions_proxy(source, [{}]);

  const error = await t.throwsAsync(
    SmartSource.prototype.get_embed_input.call(source, 'content'),
  );

  t.is(
    error.message,
    `SmartSource.get_embed_input: missing action "${action_key}" for Notes/Test.md`,
  );
});

test('repair import forces a fresh source parse', async t => {
  const source = Object.create(SmartSource.prototype);
  source.data = {
    block_embedding_selection: {
      requires_reimport: true,
    },
  };
  source._queue_import = true;
  source.emit_event = () => {};

  let import_params = null;
  Object.defineProperty(source, 'source_adapter', {
    value: {
      async import(params) {
        import_params = params;
      },
    },
  });

  await source.import({ reason: 'block-range-repair' });

  t.deepEqual(import_params, {
    reason: 'block-range-repair',
    refresh: true,
  });
  t.false(source._queue_import);
});

test('blocks_data is the only shared sharded block state', t => {
  const source = Object.create(SmartSource.prototype);
  source.data = {
    key: 'Notes/Test.md',
    blocks_data: {
      '#Current': {
        key: 'Notes/Test.md#Current',
        lines: [1, 3],
        payload: 'current',
      },
      '#Stale': {
        key: 'Notes/Test.md#Stale',
        lines: [4, 4],
        payload: 'stale',
      },
    },
  };

  t.true(source.blocks_initialized);
  t.deepEqual(source.block_keys, ['#Current', '#Stale']);
  t.true(source.has_block('#Current'));
  t.deepEqual(source.get_block_lines('#Current'), [1, 3]);

  source.replace_blocks({
    '#Current': [2, 5],
    '#New': [6, 7],
  });

  t.false(Object.prototype.hasOwnProperty.call(source.data, 'blocks'));
  t.deepEqual(source.block_keys, ['#Current', '#New']);
  t.deepEqual(source.data.blocks_data['#Current'], {
    key: 'Notes/Test.md#Current',
    lines: [2, 5],
    payload: 'current',
  });
  t.deepEqual(source.data.blocks_data['#New'], {
    key: 'Notes/Test.md#New',
    lines: [6, 7],
  });
  t.false(source.has_block('#Stale'));
});

function create_block_selection_source(params = {}) {
  const source_key = 'Notes/Test.md';
  const blocks_data = {};
  const blocks = {};
  const runtime_calls = [];
  const block_collection = {
    settings: {
      min_chars: params.min_chars ?? 200,
    },
    get(key) {
      return blocks[key];
    },
    mark_embed_queue_dirty() {
      this.embed_queue_dirty = true;
    },
  };

  for (const [sub_key, data] of Object.entries(params.blocks_data || {})) {
    const block_data = {
      key: `${source_key}${sub_key}`,
      ...data,
    };
    blocks_data[sub_key] = block_data;
    blocks[block_data.key] = {
      key: block_data.key,
      _queue_embed: true,
      clear_staged_embed_content() {
        this.staged_content_cleared = true;
      },
    };
  }

  const source = Object.create(SmartSource.prototype);
  source.data = {
    key: source_key,
    blocks_data,
  };
  source.env = {
    smart_blocks: block_collection,
    embedding_models: {
      default: {
        data: {
          max_tokens: params.max_tokens ?? 500,
        },
      },
    },
    smart_vec_index_runtime: {
      mark_collection_vec_index_dirty(collection_key) {
        runtime_calls.push(['mark', collection_key]);
      },
      schedule_collection_vec_index_rebuild(collection_key) {
        runtime_calls.push(['schedule', collection_key]);
      },
    },
  };
  source.queue_save = () => {
    source.save_count = (source.save_count || 0) + 1;
  };

  return {
    source,
    blocks,
    block_collection,
    runtime_calls,
  };
}

function get_selected_sub_keys(source) {
  return Object.entries(source.data.blocks_data)
    .filter(([, block_data]) => block_data.should_embed === true)
    .map(([sub_key]) => sub_key)
  ;
}

function assert_selected_ranges_do_not_overlap(t, source) {
  const selected_ranges = Object.values(source.data.blocks_data)
    .filter((block_data) => block_data.should_embed === true)
    .map((block_data) => block_data.lines)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  ;

  for (let i = 1; i < selected_ranges.length; i += 1) {
    t.true(selected_ranges[i][0] > selected_ranges[i - 1][1]);
  }
}

test('block embedding selection prefers disjoint descendants when estimated loss ties', t => {
  const { source, blocks, block_collection } = create_block_selection_source({
    blocks_data: {
      '#Parent': {
        lines: [1, 4],
        size: 520,
      },
      '#Parent#{1}': {
        lines: [2, 2],
        size: 250,
      },
      '#Parent#{2}': {
        lines: [3, 4],
        size: 250,
      },
    },
  });

  t.true(source.ensure_block_embedding_selection({ force: true }));
  t.deepEqual(get_selected_sub_keys(source), [
    '#Parent#{1}',
    '#Parent#{2}',
  ]);
  t.false(blocks['Notes/Test.md#Parent']._queue_embed);
  t.true(blocks['Notes/Test.md#Parent'].staged_content_cleared);
  t.true(block_collection.embed_queue_dirty);
  assert_selected_ranges_do_not_overlap(t, source);
  t.false(source.ensure_block_embedding_selection());
});


test('block embedding selection counts uncovered root content as descendant loss', t => {
  const { source } = create_block_selection_source({
    min_chars: 1,
    blocks_data: {
      '#': {
        lines: [1, 3],
        size: 520,
      },
      '##{1}': {
        lines: [2, 2],
        size: 200,
      },
      '##{2}': {
        lines: [3, 3],
        size: 200,
      },
    },
  });

  source.ensure_block_embedding_selection({ force: true });
  t.deepEqual(get_selected_sub_keys(source), ['#']);
  assert_selected_ranges_do_not_overlap(t, source);
});


test('block embedding selection queues import when persisted sizes are missing', t => {
  const { source } = create_block_selection_source({
    blocks_data: {
      '#Parent': {
        lines: [1, 2],
      },
    },
  });
  source.queue_import = () => {
    source.import_queued = true;
  };

  t.false(source.ensure_block_embedding_selection());
  t.true(source.import_queued);
  t.false(Object.hasOwn(source.data.blocks_data['#Parent'], 'should_embed'));
});

test('block embedding selection changes from fitting parent to less-lossy siblings when max input shrinks', t => {
  const {
    source,
    blocks,
    runtime_calls,
  } = create_block_selection_source({
    max_tokens: 300,
    blocks_data: {
      '#Parent': {
        lines: [1, 5],
        size: 800,
      },
      '#Parent#{1}': {
        lines: [2, 2],
        size: 250,
      },
      '#Parent#{2}': {
        lines: [3, 3],
        size: 100,
      },
      '#Parent#{3}': {
        lines: [4, 5],
        size: 250,
      },
    },
  });

  source.ensure_block_embedding_selection({ force: true });
  t.deepEqual(get_selected_sub_keys(source), ['#Parent']);

  source.env.embedding_models.default.data.max_tokens = 100;
  t.true(source.ensure_block_embedding_selection());
  t.deepEqual(get_selected_sub_keys(source), [
    '#Parent#{1}',
    '#Parent#{3}',
  ]);
  t.false(blocks['Notes/Test.md#Parent']._queue_embed);
  t.is(source.data.block_embedding_selection.max_input_chars, 370);
  t.deepEqual(runtime_calls, [
    ['mark', 'smart_blocks'],
    ['schedule', 'smart_blocks'],
    ['mark', 'smart_blocks'],
    ['schedule', 'smart_blocks'],
  ]);
  assert_selected_ranges_do_not_overlap(t, source);
});

test('block embedding selection durably queues re-import for malformed ranges', t => {
  const malformed_ranges = [
    null,
    [null, 4],
    ['1', '4'],
    [5, 1],
    [1.5, 4],
  ];

  for (const lines of malformed_ranges) {
    const { source } = create_block_selection_source({
      blocks_data: {
        '#Bad': {
          lines,
          size: 300,
          should_embed: true,
        },
      },
    });
    source.data.block_embedding_selection = {
      version: 1,
      min_chars: 200,
      max_input_chars: 1850,
      source_key: source.key,
    };
    source.queue_import = () => {
      source.import_queued = true;
    };

    source.ensure_block_embedding_selection();

    t.true(source.import_queued);
    t.false(source.data.blocks_data['#Bad'].should_embed);
    t.true(source.data.block_embedding_selection.requires_reimport);

    source.import_queued = false;
    source.ensure_block_embedding_selection();
    t.true(source.import_queued);
  }
});

test('block embedding selection accepts zero-based integer ranges', t => {
  const { source } = create_block_selection_source({
    blocks_data: {
      '#Start': {
        lines: [0, 1],
        size: 300,
      },
    },
  });

  source.ensure_block_embedding_selection({ force: true });

  t.true(source.data.blocks_data['#Start'].should_embed);
  t.false(source.data.block_embedding_selection.requires_reimport);
});

test('block embedding selection queues re-import and fails closed for crossing ranges', t => {
  const { source } = create_block_selection_source({
    blocks_data: {
      '#A': {
        lines: [1, 4],
        size: 300,
      },
      '#B': {
        lines: [3, 6],
        size: 300,
      },
    },
  });
  source.queue_import = () => {
    source.import_queued = true;
  };
  const original_warn = console.warn;
  console.warn = () => {};

  try {
    source.ensure_block_embedding_selection({ force: true });
  } finally {
    console.warn = original_warn;
  }

  t.true(source.import_queued);
  t.deepEqual(get_selected_sub_keys(source), []);
  t.true(source.data.block_embedding_selection.requires_reimport);

  source.import_queued = false;
  source.ensure_block_embedding_selection();
  t.true(source.import_queued);
});
