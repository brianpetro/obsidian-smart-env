import { setIcon } from 'obsidian';
import { register_status_bar_context_menu } from '../utils/register_status_bar_context_menu.js';
import { get_status_bar_state, should_poll_env_activity } from '../utils/status_bar_state.js';
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
      title="Smart Environment status"
      tabindex="0"
    >
      <span class="smart-env-status-icon" aria-hidden="true"></span>
      <span class="smart-env-status-msg" aria-live="polite"></span>
      <span
        class="smart-env-status-indicator"
        title="Open events feed"
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

  const set_status_message = (message) => {
    if (!status_msg) return;
    if (typeof status_msg.setText === 'function') {
      status_msg.setText(message);
      return;
    }
    status_msg.textContent = message;
  };

  const open_notifications_feed = (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    env.open_notifications_feed_modal?.();
  };

  const update_indicator = (status_state) => {
    if (!status_indicator) return;

    const {
      indicator_count,
      indicator_level,
    } = status_state;

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
    // no aria-label AND title attribute to avoid redundant tooltips (title seems to display better in bottom of screen status bar)
    // status_indicator.setAttribute('aria-label', indicator_title);
    status_indicator.setAttribute('title', indicator_title);
  };

  const action_handlers = {
    pause_embed(event) {
      event.preventDefault?.();
      event.stopPropagation?.();
      pause_embedding();
    },
    resume_embed(event) {
      event.preventDefault?.();
      event.stopPropagation?.();
      resume_embedding();
    },
    run_reimport(event) {
      event.preventDefault?.();
      event.stopPropagation?.();
      set_status_message('Re-importing…');
      env.run_re_import?.();
    },
    noop() {},
    context_menu(event) {
      const context_event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: event?.clientX || 0,
        clientY: event?.clientY || 0,
      });
      container.dispatchEvent?.(context_event);
    },
  };

  const render_status_elm = () => {
    const status_state = get_status_bar_state(env);
    const {
      message,
      title,
    } = status_state;

    if (icon_slot) {
      setIcon(icon_slot, 'smart-connections');
    }

    update_indicator(status_state);
    set_status_message(message);

    // no aria-label AND title attribute to avoid redundant tooltips (title seems to display better in bottom of screen status bar)
    // container.setAttribute?.('aria-label', title);
    container.setAttribute?.('title', title);
    container.removeAttribute?.('href');
    container.removeAttribute?.('target');
  };

  const run_container_action = (event) => {
    const status_state = get_status_bar_state(env);
    const action_key = Object.prototype.hasOwnProperty.call(action_handlers, status_state.click_action)
      ? status_state.click_action
      : 'context_menu'
    ;
    action_handlers[action_key](event);
  };

  register_status_bar_context_menu(env, container);

  let progress_poll_interval = null;
  const set_polling = (active) => {
    if (active) {
      if (progress_poll_interval) return;
      progress_poll_interval = setInterval(() => {
        refresh_status_bar();
      }, 1000);
      return;
    }

    if (!progress_poll_interval) return;
    clearInterval(progress_poll_interval);
    progress_poll_interval = null;
  };

  const refresh_status_bar = () => {
    render_status_elm();
    set_polling(should_poll_env_activity(env));
  };

  refresh_status_bar();

  bind_once(status_indicator, '_click_handler', 'click', open_notifications_feed);
  bind_once(status_indicator, '_keydown_handler', 'keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    open_notifications_feed(event);
  });

  bind_once(container, '_click_handler', 'click', (event) => {
    run_container_action(event);
  });
  bind_once(container, '_keydown_handler', 'keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    run_container_action(event);
  });

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
    set_polling(false);
    if (debounce_timeout) clearTimeout(debounce_timeout);
  });
  this.attach_disposer(container, disposers);
}

/**
 * Guard repeated DOM binding for elements that may be re-rendered by the same
 * component instance.
 *
 * @param {HTMLElement|null} element
 * @param {string} handler_key
 * @param {string} event_name
 * @param {Function} handler
 * @returns {void}
 */
function bind_once(element, handler_key, event_name, handler) {
  if (!element || typeof handler !== 'function') return;
  if (element[handler_key]) return;
  element[handler_key] = handler;
  element.addEventListener(event_name, handler);
}
