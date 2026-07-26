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
