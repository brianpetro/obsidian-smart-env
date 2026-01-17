import test from 'ava';
import { create_settings_group_rerender } from './settings_group_rerender.js';

test('rerender clears container and calls render_group', t => {
  const call_order = [];
  const scope = { settings: {} };
  const container = {
    replaceChildren() {
      call_order.push('cleared');
    },
  };
  const render_group = (...args) => {
    call_order.push(args);
    return { rendered: true };
  };
  const group_params = { heading_btn: null };

  const rerender = create_settings_group_rerender(scope, {
    container,
    group_name: 'Group',
    settings_config: {},
    group_params,
    render_group,
  });

  const result = rerender();

  t.is(call_order[0], 'cleared');
  t.is(call_order.length, 2);
  t.deepEqual(call_order[1], ['Group', scope, {}, container, group_params]);
  t.deepEqual(result, { rendered: true });
});

test('rerender returns null without container', t => {
  const rerender = create_settings_group_rerender({}, {
    container: null,
    group_name: 'Group',
    settings_config: {},
    group_params: {},
  });

  t.is(rerender(), null);
});
