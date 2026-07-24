import test from 'ava';
import { read_smart_drag_data } from './smart_drag_drop.js';
import { register_item_drag } from './register_item_drag.js';

function create_data_transfer() {
  const data = {};
  return {
    getData(type) {
      return data[type] || '';
    },
    setData(type, value) {
      data[type] = value;
    },
  };
}

test('register_item_drag preserves native drag behavior and writes Smart identity', (t) => {
  let dragstart_handler = null;
  const native_calls = [];
  const emitted_events = [];
  const container = {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(event_name, handler) {
      if (event_name === 'dragstart') dragstart_handler = handler;
    },
  };
  const drag_manager = {
    dragLink(event, link_text) {
      native_calls.push({ type: 'dragLink', event, link_text });
      return { link_text };
    },
    onDragStart(event, drag_data) {
      native_calls.push({ type: 'onDragStart', event, drag_data });
    },
  };
  const item = {
    collection_key: 'smart_blocks',
    key: 'Folder/Note.md#Heading',
    env: {
      obsidian_app: {
        dragManager: drag_manager,
      },
    },
    emit_event(event_key) {
      emitted_events.push(event_key);
    },
  };

  register_item_drag(container, item, {
    drag_event_key: 'connections:drag_result',
  });

  t.is(container.attributes.draggable, 'true');
  t.is(typeof dragstart_handler, 'function');

  const event = {
    dataTransfer: create_data_transfer(),
  };
  dragstart_handler(event);

  t.is(native_calls[0].type, 'dragLink');
  t.is(native_calls[1].type, 'onDragStart');
  t.deepEqual(read_smart_drag_data(event.dataTransfer)?.items, [
    {
      collection_key: 'smart_blocks',
      item_key: 'Folder/Note.md#Heading',
    },
  ]);
  t.deepEqual(emitted_events, ['connections:drag_result']);
});
