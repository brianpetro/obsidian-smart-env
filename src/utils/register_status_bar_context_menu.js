/**
 * @file register_status_bar_context_menu.js
 * @description
 * Adds the Smart Env status-bar context menu using registered menu actions.
 *
 * @param {import('../../smart_env.js').SmartEnv} env
 * @param {HTMLElement} status_container
 * @returns {Function}
 */

import { Menu } from 'obsidian';

export function register_status_bar_context_menu(env, status_container, deps = {}) {
  const { Menu: MenuClass = Menu } = deps;
  const plugin = env.main;

  /** @type {(ev: MouseEvent) => void} */
  const on_context_menu = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const menu = new MenuClass(plugin.app);
    env.build_menu?.('env:status_bar_menu', menu, env, {
      status_container,
      event: ev,
    });
    if (!(menu.items?.length > 0)) return;

    menu.showAtPosition({ x: ev.pageX, y: ev.pageY });
  };

  // Auto-unregistered on plugin unload
  plugin.registerDomEvent(status_container, 'contextmenu', on_context_menu);
  return on_context_menu;
}
