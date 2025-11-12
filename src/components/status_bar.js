import { setIcon } from 'obsidian';
import { register_status_bar_context_menu } from '../utils/register_status_bar_context_menu.js';
import styles from './status_bar.css' assert { type: 'css' };
/**
 * Derive status bar presentation based on queue length and notification count.
 * @param {number} queue_length
 * @param {string} version
 * @param {number} indicator_count
 * @returns {{message: string, title: string, mode: 'queue'|'idle', indicator_count: number}}
 */
function derive_status_presentation(queue_length, version, indicator_count = 0) {
  const normalized_queue = Number.isFinite(queue_length) && queue_length > 0
    ? Math.round(queue_length)
    : 0;
  const normalized_indicator = Number.isFinite(indicator_count) && indicator_count > 0
    ? Math.round(indicator_count)
    : 0;

  if (normalized_queue > 0) {
    return {
      message: `Embed now (${normalized_queue})`,
      title: 'Click to re-import.',
      mode: 'queue',
      indicator_count: normalized_indicator,
    };
  }
  const label = version ? `Smart Env ${version}` : 'Smart Env';
  return {
    message: label,
    title: 'Smart Environment status',
    mode: 'idle',
    indicator_count: normalized_indicator,
  };
}

/**
 * Build HTML for the status bar anchor.
 * @returns {string}
 */
export function build_html() {
  return `
    <a class="smart-env-status-container" title="Smart Environment status">
      <span class="smart-env-status-indicator" aria-hidden="true"></span>
      <span class="smart-env-status-msg"></span>
    </a>
  `;
}

/**
 * Render status bar element and register native context menu.
 * NOTE: SmartEnv.refresh_status() will mutate text and click behavior.
 * @param {import('../../smart_env.js').SmartEnv} env
 * @param {Object} [opts]
 * @returns {Promise<DocumentFragment>}
 */
export async function render(env, opts = {}) {
  const frag = this.create_doc_fragment(build_html());
  this.apply_style_sheet(styles);
  post_process.call(this, env, frag, opts);
  return frag;
}

/**
 * Ensure status bar DOM exists. Returns true when ready, false if re-render scheduled.
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {boolean}
 */
export function ensure_status_bar_ready(env) {
  if (env.status_elm && env.status_container && env.status_msg) {
    return true;
  }
  const status_container = env.main?.app?.statusBar?.containerEl;
  status_container?.querySelector?.('.smart-env-status-container')?.closest?.('.status-bar-item')?.remove?.();

  env.status_elm = env.main.addStatusBarItem();
  env.smart_components.render_component('status_bar', env).then((container) => {
    env.status_elm.empty?.();
    env.status_elm.appendChild(container);
    env.refresh_status();
  });
  return false;
}

/**
 * Update status bar message and interactions based on queue length and notifications.
 * @param {import('../../smart_env.js').SmartEnv} env
 * @param {number} queue_length
 * @param {number} indicator_count
 */
export function update_status_bar(env, queue_length, indicator_count = 0) {
  const presentation = derive_status_presentation(queue_length, env.constructor.version, indicator_count);
  apply_status_presentation(env, presentation);
}

function post_process(env, frag, opts = {}) {
  const {
    set_icon = setIcon,
    register_context_menu = register_status_bar_context_menu,
  } = opts;
  const anchor = frag.querySelector('.smart-env-status-container');
  const indicator = anchor?.querySelector?.('.smart-env-status-indicator');
  const msg_span = anchor?.querySelector?.('.smart-env-status-msg');

  if (anchor) {
    set_icon(anchor, 'smart-connections');
    env.open_context_menu_handler = register_context_menu(env, anchor);
  } else {
    env.open_context_menu_handler = undefined;
  }

  env.status_container = anchor || null;
  env.status_indicator = indicator || null;
  env.status_msg = msg_span || null;
}

function apply_status_presentation(env, presentation) {
  const { mode, message, title, indicator_count } = presentation;
  const { status_container, status_indicator, status_msg } = env;
  if (!status_container || !status_msg) {
    return;
  }

  ensure_handlers(env);

  status_msg.setText?.(message);
  status_container.setAttribute?.('title', title);
  status_container.removeAttribute?.('href');
  status_container.removeAttribute?.('target');

  if (status_indicator) {
    if (indicator_count > 0) {
      status_indicator.dataset.count = String(indicator_count);
    } else {
      delete status_indicator.dataset.count;
    }
  }

  if (mode === 'queue') {
    status_container.removeEventListener?.('click', env.open_menu_click_handler);
    status_container.removeEventListener?.('click', env.re_embed_click_handler);
    status_container.addEventListener?.('click', env.re_embed_click_handler);
    return;
  }

  status_container.removeEventListener?.('click', env.re_embed_click_handler);
  status_container.removeEventListener?.('click', env.open_menu_click_handler);
  status_container.addEventListener?.('click', env.open_menu_click_handler);
}

function ensure_handlers(env) {
  if (!env.re_embed_click_handler) {
    env.re_embed_click_handler = create_re_embed_handler(env);
  }
  if (!env.open_menu_click_handler) {
    env.open_menu_click_handler = create_open_menu_handler(env);
  }
}

function create_re_embed_handler(env) {
  return (event) => {
    event.preventDefault();
    event.stopPropagation();
    env.status_msg?.setText?.('Embedding...');
    env.run_re_import();
  };
}

function create_open_menu_handler(env) {
  return (event) => {
    const context_event = new MouseEvent('contextmenu', event);
    env.status_container?.dispatchEvent?.(context_event);
  };
}
