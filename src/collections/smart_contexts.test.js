import test from 'ava';
import { SmartContexts } from './smart_contexts.js';

test('remove_missing_item removes item from referenced SmartContext', (t) => {
  const removed_keys = [];
  const emitted = [];
  const scope = {
    get(key) {
      if (key !== 'Note.md#codeblock') return null;
      return {
        remove_item(item_key) {
          removed_keys.push(item_key);
        },
        emit_event(event_key, payload) {
          emitted.push({ event_key, payload });
        },
      };
    },
    emit_warning_event(event_key, payload) {
      emitted.push({ event_key, payload });
    },
  };

  const result = SmartContexts.prototype.remove_missing_item.call(scope, {
    item_key: 'Note.md#codeblock',
    missing_key: 'external:../missing-file.md',
  });

  t.true(result);
  t.deepEqual(removed_keys, ['external:../missing-file.md']);
  t.true(emitted.some((event) => event.event_key === 'context:missing_item_removed'));
});
