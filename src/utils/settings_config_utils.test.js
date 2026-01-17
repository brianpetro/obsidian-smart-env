import test from 'ava';
import {
  ensure_settings_config,
  resolve_group_settings_config,
} from './settings_config_utils.js';

test('ensure_settings_config evaluates function settings configs', t => {
  const scope = { value: 2 };
  const config_fn = (local_scope) => ({
    setting_a: { type: 'text', group: local_scope.value ? 'Group A' : 'Group B' },
  });

  t.deepEqual(
    ensure_settings_config(config_fn, scope),
    { setting_a: { type: 'text', group: 'Group A' } }
  );
});

test('resolve_group_settings_config returns grouped configs by name', t => {
  const settings_config = {
    foo: { type: 'text', group: 'Alpha' },
    bar: { type: 'number' },
  };

  t.deepEqual(
    resolve_group_settings_config(settings_config, {}, 'Alpha', 'Settings'),
    { foo: { type: 'text', group: 'Alpha' } }
  );
  t.deepEqual(
    resolve_group_settings_config(settings_config, {}, 'Settings', 'Settings'),
    { bar: { type: 'number' } }
  );
});

test('resolve_group_settings_config supports function settings configs', t => {
  const settings_config = (scope) => ({
    foo: { type: 'text', group: scope.group_name },
    bar: { type: 'text' },
  });

  t.deepEqual(
    resolve_group_settings_config(settings_config, { group_name: 'Scoped' }, 'Scoped', 'Settings'),
    { foo: { type: 'text', group: 'Scoped' } }
  );
});
