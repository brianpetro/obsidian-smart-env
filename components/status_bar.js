import { setIcon } from 'obsidian';
import { register_status_bar_context_menu } from '../utils/register_status_bar_context_menu.js';

/**
 * Build HTML for the status bar anchor.
 * @returns {string}
 */
export function build_html() {
  return `
    <a class="smart-env-status-container" title="Smart Environment status">
      <span class="smart-env-status-msg"></span>
    </a>
  `;
}

/**
 * Render status bar element and register native context menu.
 * NOTE: SmartEnv.refresh_status() will mutate text and click behavior.
 * @param {import('../smart_env.js').SmartEnv} env
 * @param {Object} [opts]
 * @returns {Promise<DocumentFragment>}
 */
export async function render(env, opts = {}) {
  const {
    set_icon = setIcon,
    register_context_menu = register_status_bar_context_menu,
  } = opts;
  const frag = this.create_doc_fragment(build_html());
  const anchor = frag.querySelector('.smart-env-status-container');
  const msg_span = anchor?.querySelector?.('.smart-env-status-msg');

  if (anchor) {
    set_icon(anchor, 'smart-connections');
    env.open_context_menu_handler = register_context_menu(env, anchor);
  } else {
    env.open_context_menu_handler = undefined;
  }
  env.status_container = anchor || null;
  env.status_msg = msg_span || null;

  return frag;
}
