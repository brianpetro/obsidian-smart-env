import test from 'ava';
import { env_open_pro_link, menus, version } from './open_pro_link.js';
import { merge_env_config } from 'smart-environment/utils/merge_env_config.js';

test.serial('Status bar opens the Pro page without referral rewards for either account state', (t) => {
  const original_window = globalThis.window;
  const calls = [];
  globalThis.window = {
    open(url, target) { calls.push({ url, target }); },
  };
  try {
    for (const is_pro of [true, false]) {
      t.true(env_open_pro_link.call({ is_pro }));
    }
    t.deepEqual(calls, [true, false].map(() => ({
      url: 'https://smartconnections.app/pro-plugins/?utm_source=status-bar',
      target: '_external',
    })));
    const menu = menus['env:status_bar_menu'];
    t.is(menu.title.call({ scope: { is_pro: true } }), 'Explore Pro plugins');
    t.is(menu.title.call({ scope: { is_pro: false } }), 'Start 14-day Pro trial');
  } finally {
    if (original_window === undefined) delete globalThis.window;
    else globalThis.window = original_window;
  }
});

test('Cleaned status bar action wins over an older plugin in either load order', (t) => {
  const old_action = () => {};
  for (const old_first of [true, false]) {
    const old_config = {
      version: '3.1.3',
      actions: { env_open_pro_link: { action: old_action, version: '1.0.3' } },
    };
    const new_config = {
      version: '3.1.3',
      actions: { env_open_pro_link: { action: env_open_pro_link, menus, version } },
    };
    const merged = {};
    merge_env_config(merged, old_first ? old_config : new_config);
    merge_env_config(merged, old_first ? new_config : old_config);
    t.is(merged.actions.env_open_pro_link.action, env_open_pro_link);
    t.is(merged.actions.env_open_pro_link.menus, menus);
  }
});
