import test from 'ava';
import {
  should_offer_plugin_update,
} from './smart_plugins_state.js';

function compare_versions(left, right) {
  const left_pcs = String(left || '').split('.').map((value) => Number(value) || 0);
  const right_pcs = String(right || '').split('.').map((value) => Number(value) || 0);
  const max_len = Math.max(left_pcs.length, right_pcs.length);

  for (let i = 0; i < max_len; i += 1) {
    const left_value = left_pcs[i] || 0;
    const right_value = right_pcs[i] || 0;
    if (left_value > right_value) return 1;
    if (left_value < right_value) return -1;
  }

  return 0;
}

test('installed Pro + not entitled + newer version does not show update', (t) => {
  const should_update = should_offer_plugin_update({
    item_type: 'pro',
    installed_type: 'pro',
    is_entitled: false,
    is_enabled: true,
    is_loaded: true,
    is_deferred: false,
    loaded_env_version: '2.5.2',
    server_version: '2.0.0',
    installed_version: '1.0.0',
    compare_versions,
  });

  t.false(should_update);
});
