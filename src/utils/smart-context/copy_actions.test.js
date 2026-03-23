import test from 'ava';
import {
  build_copy_action_descriptors,
  has_linked_depth_items,
} from './copy_actions.js';

function build_ctx(params = {}) {
  const context_items = Array.isArray(params.context_items) ? params.context_items : [];
  return {
    item_count: params.item_count ?? context_items.length,
    context_items: {
      filter(predicate) {
        if (typeof predicate === 'function') return context_items.filter(predicate);
        return context_items;
      },
    },
    actions: {
      context_copy_to_clipboard() {},
    },
    emit_event() {},
    env: {
      plugin: { app: {} },
      config: {
        modals: {
          copy_context_modal: {
            class: class CopyContextModal {
              open() {}
            },
          },
        },
      },
    },
  };
}

test('has_linked_depth_items detects non-zero depths only', (t) => {
  t.false(has_linked_depth_items(build_ctx({
    context_items: [{ key: 'root.md', data: { d: 0 } }],
  })));

  t.true(has_linked_depth_items(build_ctx({
    context_items: [
      { key: 'root.md', data: { d: 0 } },
      { key: 'child.md', data: { d: 2 } },
    ],
  })));
});

test('build_copy_action_descriptors returns core copy + link tree by default', (t) => {
  const descriptors = build_copy_action_descriptors(build_ctx({
    context_items: [{ key: 'root.md', data: { d: 0 } }],
  }));

  t.deepEqual(
    descriptors.map((descriptor) => descriptor.key),
    ['copy_text', 'copy_link_tree'],
  );
});

test('build_copy_action_descriptors adds media and depth actions when available', (t) => {
  const descriptors = build_copy_action_descriptors(build_ctx({
    context_items: [
      { key: 'root.md', data: { d: 0 } },
      { key: 'child.md', data: { d: 1 } },
    ],
  }), {
    supports_media: true,
  });

  t.deepEqual(
    descriptors.map((descriptor) => descriptor.key),
    [
      'copy_text',
      'copy_media',
      'copy_depth_text',
      'copy_depth_media',
      'copy_link_tree',
    ],
  );
});
