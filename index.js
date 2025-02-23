/**
 * @file index.js
 * @description Entry point for the obsidian-smart-env package. Checks for an
 * existing `window.smart_env`, creates or updates it, and merges Obsidian-specific
 * config with plugin-specific `smart-env.config`.
 */

import { SmartEnv } from 'smart-environment';

/**
 * Initializes or updates a SmartEnv instance in `window.smart_env` using a plugin-specific config.
 * @function init_obsidian_smart_env
 * @param {Object} [plugin_config={}] - Additional or custom config for Obsidian usage.
 * @returns {Promise<SmartEnv>} The SmartEnv instance.
 */
export async function init_smart_env(main, plugin_config = null) {
  if(!plugin_config) plugin_config = main.smart_env_config;
  return await SmartEnv.create(main, {
    global_prop: 'smart_env',
    collections: {},
    item_types: {},
    modules: {},
    ...plugin_config,
  });
}

export async function wait_for_smart_env() {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (window.smart_env && window.smart_env.collections_loaded) {
        clearInterval(interval);
        resolve(window.smart_env);
      }
    }, 100);
  });
}

export async function wait_for_smart_env_then_init(main, plugin_config = null) {
  await wait_for_smart_env();
  await init_smart_env(main, plugin_config);
}
