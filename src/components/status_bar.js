import { setIcon } from 'obsidian';
import { register_status_bar_context_menu } from '../utils/register_status_bar_context_menu.js';
import { get_status_bar_state } from '../utils/status_bar_state.js';
import styles from './status_bar.css';

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
      aria-label="Smart Environment status"
      tabindex="0"
    >
      <span class="smart-env-status-icon" aria-hidden="true"></span>
      <span class="smart-env-status-msg" aria-live="polite"></span>
      <span
        class="smart-env-status-indicator"
        aria-label="Open events feed"
        role="button"
        tabindex="0"
      ></span>
    </a>
  `;
}

/**
 * Render the status bar element using SmartView. Returns the root element.
 * @param {import('../../smart_env.js').SmartEnv} env
 * @param {Object} [opts]
 * @returns {Promise<HTMLElement>}
 */
export async function render(env, opts = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html());
  const anchor = frag.firstElementChild;
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

  const pause_embedding = () => {
    return env?.smart_sources?.entities_vector_adapter?.halt_embed_queue_processing?.();
  };

  const resume_embedding = () => {
    return env?.smart_sources?.entities_vector_adapter?.resume_embed_queue_processing?.();
  };

  const render_status_elm = () => {
    const status_state = get_status_bar_state(env);
    const {
      message,
      title,
      indicator_count,
      indicator_level,
    } = status_state;

    if (icon_slot) {
      setIcon(icon_slot, 'smart-connections');
    }

    if (status_indicator) {
      if (!status_indicator._click_handler) {
        status_indicator._click_handler = (event) => {
          event.stopPropagation();
          env.open_notifications_feed_modal?.();
        };
        status_indicator.addEventListener('click', status_indicator._click_handler);
      }

      if (!status_indicator._keydown_handler) {
        status_indicator._keydown_handler = (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          env.open_notifications_feed_modal?.();
        };
        status_indicator.addEventListener('keydown', status_indicator._keydown_handler);
      }

      status_indicator.dataset.level = indicator_level || 'default';

      if (indicator_count > 0) {
        status_indicator.dataset.count = String(indicator_count);
      } else {
        status_indicator.removeAttribute('data-count');
      }

      const indicator_title = indicator_count > 0
        ? `${indicator_count} unseen notification${indicator_count === 1 ? '' : 's'}`
        : 'Open notifications feed'
      ;
      status_indicator.setAttribute('aria-label', indicator_title);
    }

    if (status_msg) {
      if (typeof status_msg.setText === 'function') status_msg.setText(message);
      else status_msg.textContent = message;
    }
    container.setAttribute?.('aria-label', title);
    container.removeAttribute?.('href');
    container.removeAttribute?.('target');
  };

  const has_active_progress = () => {
    if (env?.state === 'loading') return true;
    if (env?.smart_sources?.get_import_progress_state?.()?.active) return true;
    if (env?.smart_sources?.entities_vector_adapter?.get_progress_state?.()?.active) return true;
    return false;
  };

  const run_container_action = (event) => {
    const status_state = get_status_bar_state(env);
    switch (status_state.click_action) {
      case 'pause_embed':
        event.preventDefault();
        event.stopPropagation();
        pause_embedding();
        return;
      case 'resume_embed':
        event.preventDefault();
        event.stopPropagation();
        resume_embedding();
        return;
      case 'run_reimport':
        event.preventDefault();
        event.stopPropagation();
        if (status_msg) {
          if (typeof status_msg.setText === 'function') status_msg.setText('Re-importing…');
          else status_msg.textContent = 'Re-importing…';
        }
        env.run_re_import?.();
        return;
      case 'noop':
        return;
      default: {
        const context_event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: event?.clientX || 0,
          clientY: event?.clientY || 0,
        });
        container.dispatchEvent?.(context_event);
      }
    }
  };

  register_status_bar_context_menu(env, container);

  let progress_poll_interval = null;
  const start_progress_polling = () => {
    if (progress_poll_interval) return;
    progress_poll_interval = setInterval(() => {
      render_status_elm();
    }, 1000);
  };

  const stop_progress_polling = () => {
    if (!progress_poll_interval) return;
    clearInterval(progress_poll_interval);
    progress_poll_interval = null;
  };

  const sync_progress_polling = () => {
    if (has_active_progress()) {
      start_progress_polling();
      return;
    }
    stop_progress_polling();
  };

  const refresh_status_bar = () => {
    render_status_elm();
    sync_progress_polling();
  };

  refresh_status_bar();

  if (!container._click_handler) {
    container._click_handler = (event) => {
      run_container_action(event);
    };
    container.addEventListener('click', container._click_handler);
  }

  if (!container._keydown_handler) {
    container._keydown_handler = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      run_container_action(event);
    };
    container.addEventListener('keydown', container._keydown_handler);
  }

  let debounce_timeout = null;
  const debounce_refresh_status_bar = () => {
    if (debounce_timeout) clearTimeout(debounce_timeout);
    debounce_timeout = setTimeout(() => {
      refresh_status_bar();
      debounce_timeout = null;
    }, 100);
  };

  const disposers = [];
  disposers.push(env.events.on('*', debounce_refresh_status_bar));
  disposers.push(() => {
    stop_progress_polling();
    if (debounce_timeout) clearTimeout(debounce_timeout);
  });
  this.attach_disposer(container, disposers);
}
