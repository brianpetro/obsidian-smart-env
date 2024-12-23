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
export async function init_obsidian_smart_env(plugin_config = {}) {
  // By default, references the global object in a browser environment
  let env = window.smart_env;

  // If no SmartEnv is found in window, create a new one using plugin_config
  if (!env) {
    const main = {}; // minimal "main" object to pass to SmartEnv
    env = await SmartEnv.create(main, {
      ...plugin_config,
      global_ref: window,
      global_prop: 'smart_env'
    });

    // Ensure window.smart_env is set
    window.smart_env = env;
  } else {
    // Merge plugin-specific config into existing env
    env.merge_options(plugin_config);
    // Optionally, re-load or re-init collections if necessary
    await env.load_main(env.mains[env.mains.length - 1]);
  }

  return env;
}