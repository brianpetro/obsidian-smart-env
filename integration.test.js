/**
 * @file integration.test.js
 * @description Integration-level tests for obsidian-smart-env using ava.
 */

import test from 'ava';
import { init_obsidian_smart_env } from './index.js';

test.serial('creates a SmartEnv instance if none exists in window', async t => {
  // Clear any existing global for test isolation
  delete globalThis.window?.smart_env;

  // Provide a small plugin config
  const plugin_config = {
    env_path: '/my/test/obsidian/vault',
    collections: {
      custom_obsidian_notes: {
        class: function StubCollection() {},
      }
    }
  };

  const env = await init_obsidian_smart_env(plugin_config);

  t.truthy(env, 'SmartEnv should be returned');
  t.is(globalThis.window.smart_env, env, 'Global window.smart_env should be set');
  t.is(env.opts.env_path, '/my/test/obsidian/vault', 'env_path should match the plugin config');
  t.true(!!env.collections.custom_obsidian_notes, 'Should have loaded custom_obsidian_notes collection');
});

test.serial('updates existing SmartEnv instance with new plugin config', async t => {
  // window.smart_env should already exist from previous test in the same process
  const additional_config = {
    collections: {
      another_obsidian_collection: {
        class: function AnotherStub() {}
      }
    }
  };

  const env = await init_obsidian_smart_env(additional_config);

  t.truthy(env.collections.another_obsidian_collection, 'New collection should be merged in');
  t.is(env, window.smart_env, 'Should still reference the same SmartEnv instance');
});
