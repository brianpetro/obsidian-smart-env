import { setIcon } from 'obsidian';
import { register_status_bar_context_menu } from '../utils/register_status_bar_context_menu.js';
import styles from './status_bar.css' assert { type: 'css' };

/**
 * Build HTML for the status bar anchor. Includes dedicated icon and indicator slots to
 * avoid setIcon clobbering content.
 * @returns {string}
 */
export function build_html() {
  return `
    <a
      class="smart-env-status-container"
      role="button"
      title="Smart Environment status"
      aria-label="Smart Environment status"
      tabindex="0"
    >
      <span class="smart-env-status-icon" aria-hidden="true"></span>
      <span class="smart-env-status-msg" aria-live="polite"></span>
      <span
        class="smart-env-status-indicator"
        title="Open notifications"
        aria-label="Open notifications feed"
        role="button"
        tabindex="0"
      ></span>
    </a>
  `;
}

/**
 * Render the status bar element using SmartView. Returns the root element (not the fragment),
 * matching the pattern used by other components.
 * @param {import('../../smart_env.js').SmartEnv} env
 * @param {Object} [opts]
 * @returns {Promise<HTMLElement>}
 */
export async function render(env, opts = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html());
  const anchor = frag.querySelector('.smart-env-status-container');
  post_process.call(this, env, anchor, opts);
  return anchor;
}

/**
 * Finalize DOM and register context menu and stable handlers.
 * @param {import('../../smart_env.js').SmartEnv} env
 * @param {HTMLElement} container
 * @param {Object} opts
 */
function post_process(env, container, opts = {}) {
  const icon_slot = container?.querySelector?.('.smart-env-status-icon');
  const status_indicator = container?.querySelector?.('.smart-env-status-indicator');
  const status_msg = container?.querySelector?.('.smart-env-status-msg');
  const version = env.constructor?.version || '';
  const get_session_event_count = () => {
    return env.event_logs?.session_events?.length || 0;
  }
  const get_embed_queue = () => {
    return Object.keys(env.sources_re_import_queue || {}).length;
  }
  const render_status_elm = () => {
    const embed_queue = get_embed_queue();
    let message = `Smart Env${version ? ' ' + version : ''}`;
    let title = 'Smart Environment status';
    let indicator_count = get_session_event_count();
    let indicator_level = 'info';
    if(embed_queue > 0) {
      message = `Embed now (${embed_queue})`;
      title = 'Click to re-import.';
      indicator_level = 'attention';
    }
    if (icon_slot) {
      setIcon(icon_slot, 'smart-connections');
    }
    if (status_indicator) {
      if(!status_indicator._click_handler) {
        status_indicator._click_handler = (event) => {
          event.stopPropagation();
          env.open_notifications_feed_modal?.();
        }
        status_indicator.addEventListener('click', status_indicator._click_handler);
      }
      if (indicator_count > 0) {
        status_indicator.dataset.count = String(indicator_count);
      } else {
        delete status_indicator.dataset.count;
      }
      if (indicator_level) {
        status_indicator.dataset.level = String(indicator_level);
      } else {
        delete status_indicator.dataset.level;
      }
    }
    // Text and title
    status_msg.setText?.(message);
    container.setAttribute?.('title', title);
    container.removeAttribute?.('href');
    container.removeAttribute?.('target');
  
    if (!container._click_handler) {
      container._click_handler = (event) => {
        const curr_embed_queue = get_embed_queue();
        if (curr_embed_queue > 0) {
          event.preventDefault();
          event.stopPropagation();
          status_msg?.setText?.('Embedding...');
          env.run_re_import?.();
        } else {
          const context_event = new MouseEvent('contextmenu', event);
          container.dispatchEvent?.(context_event);
        }
      }
      container.addEventListener('click', container._click_handler);
    }
  };
  register_status_bar_context_menu(env, container);
  render_status_elm();

  let debounce_timeout = null;
  const debounce_refresh_status_bar = () => {
    if (debounce_timeout) clearTimeout(debounce_timeout);
    debounce_timeout = setTimeout(() => {
      render_status_elm();
      debounce_timeout = null;
    }, 100);
  }

  const disposers = [];
  disposers.push(env.events.on('*', debounce_refresh_status_bar));
  this.attach_disposer(container, disposers);

}