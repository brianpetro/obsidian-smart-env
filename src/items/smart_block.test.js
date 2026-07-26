import test from 'ava';
import { SmartBlock as CoreSmartBlock } from 'smart-blocks/smart_block.js';
import { create_actions_proxy } from 'smart-collections/utils/create_actions_proxy.js';
import { SmartBlock } from './smart_block.js';

test('get_embed_input inherits the strict core block contract', async t => {
  t.false(Object.hasOwn(SmartBlock.prototype, 'get_embed_input'));
  t.is(
    SmartBlock.prototype.get_embed_input,
    CoreSmartBlock.prototype.get_embed_input,
  );

  const action_key = 'block_get_embed_input_markdown';
  const block_adapter = { embed_input_action_key: action_key };
  let unused_reads = 0;
  const configured_actions = {
    [action_key]: {
      async action(params) {
        t.is(this, block);
        t.deepEqual(params, { content: 'content' });
        t.is(this.block_adapter, block_adapter);
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

  const block = {
    key: 'Notes/Test.md#Heading',
    block_adapter,
  };
  Object.defineProperty(block, 'actions', {
    get() {
      if (!this._actions) {
        this._actions = create_actions_proxy(this, [configured_actions]);
      }
      return this._actions;
    },
  });

  const result = await SmartBlock.prototype.get_embed_input.call(block, 'content');

  t.is(result, 'delegated input');
  t.is(unused_reads, 0);
  t.truthy(block._actions);
});

test('get_embed_input rejects a missing block adapter action key', async t => {
  let actions_accessed = false;
  const block = {
    key: 'Notes/Test.md#Heading',
    block_adapter: {},
  };
  Object.defineProperty(block, 'actions', {
    get() {
      actions_accessed = true;
      return {};
    },
  });

  const error = await t.throwsAsync(
    SmartBlock.prototype.get_embed_input.call(block, 'content'),
  );

  t.is(
    error.message,
    'SmartBlock.get_embed_input: missing embed_input_action_key for Notes/Test.md#Heading',
  );
  t.false(actions_accessed);
});

test('get_embed_input rejects a missing configured block action', async t => {
  const action_key = 'block_get_embed_input_markdown';
  const block = {
    key: 'Notes/Test.md#Heading',
    block_adapter: { embed_input_action_key: action_key },
  };
  block.actions = create_actions_proxy(block, [{}]);

  const error = await t.throwsAsync(
    SmartBlock.prototype.get_embed_input.call(block, 'content'),
  );

  t.is(
    error.message,
    `SmartBlock.get_embed_input: missing action "${action_key}" for Notes/Test.md#Heading`,
  );
});

test('block membership is attached only through blocks_data writes', t => {
  const source = {
    key: 'Notes/Test.md',
    data: {
      blocks_data: {},
    },
    has_block(sub_key) {
      return Object.prototype.hasOwnProperty.call(this.data.blocks_data, sub_key);
    },
    queue_save() {
      this._queue_save = true;
    },
  };
  const block = Object.create(SmartBlock.prototype);
  block._pending_data = {
    key: 'Notes/Test.md#Heading',
    lines: [1, 3],
    payload: 'current',
    path: 'Notes/Test.md#Heading',
    class_name: 'SmartBlock',
  };
  Object.defineProperty(block, 'source', {
    value: source,
    configurable: true,
  });
  Object.defineProperty(block, 'collection', {
    value: {
      items: {
        'Notes/Test.md#Heading': block,
      },
      _defer_embed_saves: false,
    },
    configurable: true,
  });

  t.is(block.data, block._pending_data);
  t.deepEqual(source.data.blocks_data, {});

  block.queue_save();

  t.false(Object.prototype.hasOwnProperty.call(source.data, 'blocks'));
  t.is(source.data.blocks_data['#Heading'], block.data);
  t.is(source.data.blocks_data['#Heading'].payload, 'current');
  t.false(Object.prototype.hasOwnProperty.call(source.data.blocks_data['#Heading'], 'path'));
  t.false(Object.prototype.hasOwnProperty.call(source.data.blocks_data['#Heading'], 'class_name'));
  t.true(source._queue_save);

  block.deleted = true;
  block.queue_save();

  t.false(source.has_block('#Heading'));
  t.false(Object.prototype.hasOwnProperty.call(block.collection.items, 'Notes/Test.md#Heading'));
});
