import test from 'ava';
import { SmartBlocks } from './smart_blocks.js';

test('embed_queue excludes deselected blocks with stale queue flags', (t) => {
  const parent = {
    key: 'Notes/Test.md#Parent',
    _queue_embed: true,
    should_embed: false,
  };
  const child = {
    key: 'Notes/Test.md#Parent#{1}',
    _queue_embed: false,
    should_embed: true,
  };
  const vector_checks = [];
  const collection = {
    _embed_queue_ready: false,
    _embed_queue: [],
    items: {
      [parent.key]: parent,
      [child.key]: child,
    },
    embeddings: {
      get_active_file_info() { return {}; },
      has_current_vector_ref(block) {
        vector_checks.push(block.key);
        return false;
      },
    },
  };
  const get_embed_queue = Object.getOwnPropertyDescriptor(
    SmartBlocks.prototype,
    'embed_queue',
  ).get;

  const embed_queue = get_embed_queue.call(collection);

  t.deepEqual(embed_queue.map((item) => item.key), [child.key]);
  t.false(parent._queue_embed);
  t.deepEqual(vector_checks, [child.key]);
});
