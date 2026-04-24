import test from 'ava';
import {
  compute_plugin_list_item_state,
  get_install_enable_behavior,
} from './smart_plugins_state.js';

function summarize_computed_state(computed_state = {}) {
  return {
    row_item_type: computed_state.row?.item_type ?? null,
    row_control_state: computed_state.row?.control_state ?? null,
    core_control_state: computed_state.track_states?.core?.control_state ?? null,
    pro_control_state: computed_state.track_states?.pro?.control_state ?? null,
  };
}

const computed_state_cases = [
  {
    title: 'single core row stays installable',
    params: {
      has_core_plugin: true,
      has_pro_plugin: false,
      display_item_type: 'core',
      installed_type: null,
      is_entitled: false,
      should_update: false,
      has_outdated_env_compatibility: false,
      is_deferred: false,
      is_loaded: false,
      is_enabled: false,
    },
    expected: {
      row_item_type: 'core',
      row_control_state: 'can_install',
      core_control_state: 'can_install',
      pro_control_state: null,
    },
  },
  {
    title: 'grouped guest row defaults to core install path',
    params: {
      has_core_plugin: true,
      has_pro_plugin: true,
      display_item_type: 'group',
      installed_type: null,
      is_entitled: false,
      should_update: false,
      has_outdated_env_compatibility: false,
      is_deferred: false,
      is_loaded: false,
      is_enabled: false,
    },
    expected: {
      row_item_type: 'core',
      row_control_state: 'can_install_core_only',
      core_control_state: 'can_install_core_only',
      pro_control_state: 'cant_install',
    },
  },
  {
    title: 'grouped entitled row defaults to pro install path',
    params: {
      has_core_plugin: true,
      has_pro_plugin: true,
      display_item_type: 'group',
      installed_type: null,
      is_entitled: true,
      should_update: false,
      has_outdated_env_compatibility: false,
      is_deferred: false,
      is_loaded: false,
      is_enabled: false,
    },
    expected: {
      row_item_type: 'pro',
      row_control_state: 'can_install_pro',
      core_control_state: 'included_in_pro',
      pro_control_state: 'can_install_pro',
    },
  },
  {
    title: 'grouped disabled core install shows enable while pro row stays upgrade path',
    params: {
      has_core_plugin: true,
      has_pro_plugin: true,
      display_item_type: 'group',
      installed_type: 'core',
      is_entitled: false,
      should_update: false,
      has_outdated_env_compatibility: false,
      is_deferred: false,
      is_loaded: false,
      is_enabled: false,
    },
    expected: {
      row_item_type: 'core',
      row_control_state: 'can_enable',
      core_control_state: 'can_enable',
      pro_control_state: 'core_installed',
    },
  },
  {
    title: 'grouped core install surfaces true update availability on installed row',
    params: {
      has_core_plugin: true,
      has_pro_plugin: true,
      display_item_type: 'group',
      installed_type: 'core',
      is_entitled: true,
      should_update: true,
      has_outdated_env_compatibility: false,
      is_deferred: false,
      is_loaded: false,
      is_enabled: true,
    },
    expected: {
      row_item_type: 'core',
      row_control_state: 'update_available',
      core_control_state: 'update_available',
      pro_control_state: 'core_installed',
    },
  },
  {
    title: 'grouped loaded pro install keeps core informational only',
    params: {
      has_core_plugin: true,
      has_pro_plugin: true,
      display_item_type: 'group',
      installed_type: 'pro',
      is_entitled: true,
      should_update: false,
      has_outdated_env_compatibility: false,
      is_deferred: false,
      is_loaded: true,
      is_enabled: true,
    },
    expected: {
      row_item_type: 'pro',
      row_control_state: 'loaded',
      core_control_state: 'included_in_pro',
      pro_control_state: 'loaded',
    },
  },
  {
    title: 'grouped installed pro row stays installed even after entitlement is lost',
    params: {
      has_core_plugin: true,
      has_pro_plugin: true,
      display_item_type: 'group',
      installed_type: 'pro',
      is_entitled: false,
      should_update: false,
      has_outdated_env_compatibility: false,
      is_deferred: false,
      is_loaded: false,
      is_enabled: true,
    },
    expected: {
      row_item_type: 'pro',
      row_control_state: 'installed',
      core_control_state: 'included_in_pro',
      pro_control_state: 'installed',
    },
  },
  {
    title: 'single pro row surfaces outdated env compatibility separately from semver update',
    params: {
      has_core_plugin: false,
      has_pro_plugin: true,
      display_item_type: 'pro',
      installed_type: 'pro',
      is_entitled: true,
      should_update: false,
      has_outdated_env_compatibility: true,
      is_deferred: false,
      is_loaded: false,
      is_enabled: true,
    },
    expected: {
      row_item_type: 'pro',
      row_control_state: 'outdated_env',
      core_control_state: null,
      pro_control_state: 'outdated_env',
    },
  },
];

for (const state_case of computed_state_cases) {
  test(`compute_plugin_list_item_state: ${state_case.title}`, (t) => {
    const actual = summarize_computed_state(
      compute_plugin_list_item_state(state_case.params)
    );

    t.deepEqual(actual, state_case.expected);
  });
}

const install_enable_cases = [
  {
    title: 'new install enables plugin after files are written',
    params: {
      was_installed: false,
      was_enabled: false,
    },
    expected: {
      should_disable_before_install: false,
      should_enable_after_install: true,
    },
  },
  {
    title: 'enabled update disables before swap and re-enables after',
    params: {
      was_installed: true,
      was_enabled: true,
    },
    expected: {
      should_disable_before_install: true,
      should_enable_after_install: true,
    },
  },
  {
    title: 'disabled update stays disabled after files are updated',
    params: {
      was_installed: true,
      was_enabled: false,
    },
    expected: {
      should_disable_before_install: false,
      should_enable_after_install: false,
    },
  },
];

for (const install_case of install_enable_cases) {
  test(`get_install_enable_behavior: ${install_case.title}`, (t) => {
    t.deepEqual(
      get_install_enable_behavior(install_case.params),
      install_case.expected,
    );
  });
}
