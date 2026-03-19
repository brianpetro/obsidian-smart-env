import styles from './env_status.css';
import {
  get_env_activity_state,
  should_poll_env_activity,
} from '../utils/status_bar_state.js';

export function build_html() {
  return `<div class="smart-env-status-view">
    <div class="smart-env-status-view__header">
      <div class="smart-env-status-view__eyebrow">Smart Environment</div>
      <h1 class="smart-env-status-view__title"></h1>
      <div class="smart-env-status-view__status" aria-live="polite"></div>
    </div>
    <div class="smart-env-status-view__summary"></div>
    <div
      class="smart-env-status-view__progress"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      hidden
    >
      <div class="smart-env-status-view__progress-fill"></div>
    </div>
    <div class="smart-env-status-view__details"></div>
    <div class="smart-env-status-view__actions"></div>
  </div>`;
}

export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}

export async function post_process(env, container, params = {}) {
  const {
    live_updates = true,
    event = null,
    event_key = '',
  } = params;

  if (event_key) {
    container.dataset.eventKey = event_key;
  }
  if (typeof event?.level === 'string' && event.level.trim()) {
    container.dataset.eventLevel = event.level.trim();
  }

  const title_el = container.querySelector('.smart-env-status-view__title');
  const status_el = container.querySelector('.smart-env-status-view__status');
  const summary_el = container.querySelector('.smart-env-status-view__summary');
  const progress_el = container.querySelector('.smart-env-status-view__progress');
  const progress_fill_el = container.querySelector('.smart-env-status-view__progress-fill');
  const details_el = container.querySelector('.smart-env-status-view__details');
  const actions_el = container.querySelector('.smart-env-status-view__actions');

  const render_state = () => {
    const view_state = get_env_activity_state(env);

    set_text(title_el, view_state.view_title);
    set_text(status_el, view_state.view_status, { hide_empty: true });
    set_text(summary_el, view_state.view_summary, { hide_empty: true });

    render_progress(progress_el, progress_fill_el, view_state);
    render_details(details_el, view_state.view_details);
    render_actions(actions_el, env, view_state.view_actions, {
      event,
      event_key,
    });
  };

  let polling_interval = null;
  const set_polling = (active) => {
    if (active) {
      if (polling_interval) return;
      polling_interval = setInterval(() => {
        render_state();
        set_polling(should_poll_env_activity(env));
      }, 1000);
      return;
    }

    if (!polling_interval) return;
    clearInterval(polling_interval);
    polling_interval = null;
  };

  let debounce_timeout = null;
  const refresh = () => {
    if (debounce_timeout) clearTimeout(debounce_timeout);
    debounce_timeout = setTimeout(() => {
      debounce_timeout = null;
      render_state();
      set_polling(should_poll_env_activity(env));
    }, 100);
  };

  render_state();

  if (!live_updates) return container;

  set_polling(should_poll_env_activity(env));

  const disposers = [];
  if (typeof env?.events?.on === 'function') {
    disposers.push(env.events.on('*', refresh));
  }
  disposers.push(() => {
    set_polling(false);
    if (debounce_timeout) clearTimeout(debounce_timeout);
  });
  this.attach_disposer(container, disposers);

  return container;
}

/**
 * @param {HTMLElement} element
 * @param {string} value
 * @param {object} [params={}]
 * @param {boolean} [params.hide_empty=false]
 * @returns {void}
 */
function set_text(element, value, params = {}) {
  if (!element) return;
  const { hide_empty = false } = params;
  const text = typeof value === 'string' ? value : '';
  element.textContent = text;
  if (hide_empty) element.hidden = !text;
}

/**
 * @param {HTMLElement} progress_el
 * @param {HTMLElement} progress_fill_el
 * @param {object} view_state
 * @returns {void}
 */
function render_progress(progress_el, progress_fill_el, view_state) {
  const progress_pct = typeof view_state.progress_pct === 'number'
    ? Math.max(0, Math.min(100, view_state.progress_pct))
    : null
  ;

  if (progress_pct === null) {
    progress_el.hidden = true;
    progress_fill_el.style.width = '0%';
    progress_el.removeAttribute('aria-valuenow');
    progress_el.setAttribute('aria-valuemax', '100');
    return;
  }

  progress_el.hidden = false;
  progress_fill_el.style.width = `${progress_pct}%`;
  if (typeof view_state.progress_value === 'number') {
    progress_el.setAttribute('aria-valuenow', String(view_state.progress_value));
  } else {
    progress_el.removeAttribute('aria-valuenow');
  }
  progress_el.setAttribute(
    'aria-valuemax',
    String(typeof view_state.progress_total === 'number' && view_state.progress_total > 0
      ? view_state.progress_total
      : 100),
  );
}

/**
 * @param {HTMLElement} details_el
 * @param {string[]} details
 * @returns {void}
 */
function render_details(details_el, details = []) {
  details_el.replaceChildren();
  details
    .filter(Boolean)
    .forEach((detail) => {
      const detail_el = details_el.ownerDocument.createElement('div');
      detail_el.className = 'smart-env-status-view__detail';
      detail_el.textContent = detail;
      details_el.appendChild(detail_el);
    })
  ;
  details_el.hidden = details_el.childElementCount === 0;
}

/**
 * @param {HTMLElement} actions_el
 * @param {any} env
 * @param {string[]} action_keys
 * @param {object} [params={}]
 * @returns {void}
 */
function render_actions(actions_el, env, action_keys = [], params = {}) {
  actions_el.replaceChildren();

  action_keys.forEach((action_key) => {
    const btn = actions_el.ownerDocument.createElement('button');
    btn.type = 'button';
    btn.className = 'smart-env-status-view__btn';
    bind_action_button(btn, env, action_key, params);
    actions_el.appendChild(btn);
  });

  actions_el.hidden = actions_el.childElementCount === 0;
}

/**
 * @param {string} action_key
 * @returns {string}
 */
function get_action_label(action_key) {
  switch (action_key) {
    case 'load_env':
      return 'Load Smart Environment';
    case 'pause_embed':
      return 'Pause embedding';
    case 'resume_embed':
      return 'Resume embedding';
    case 'run_reimport':
      return 'Run re-import';
    case 'open_notifications':
      return 'Open events feed';
    default:
      return action_key;
  }
}

/**
 * @param {HTMLButtonElement} btn
 * @param {any} env
 * @param {string} action_key
 * @param {object} [params={}]
 * @returns {void}
 */
function bind_action_button(btn, env, action_key, params = {}) {
  const label = get_action_label(action_key);
  btn.textContent = label;

  if (['load_env', 'resume_embed', 'run_reimport'].includes(action_key)) {
    btn.classList.add('smart-env-status-view__btn--primary');
  }

  btn.addEventListener('click', async () => {
    await run_action_key(env, action_key, params);
  });
}

/**
 * @param {any} env
 * @param {string} action_key
 * @param {object} [params={}]
 * @returns {Promise<void>}
 */
async function run_action_key(env, action_key, params = {}) {
  switch (action_key) {
    case 'load_env':
      if (typeof env?.start_mobile_env_load === 'function') {
        await env.start_mobile_env_load({
          source: 'env_status_component',
          open_progress_view: false,
          event: params.event,
          event_key: params.event_key,
        });
        return;
      }
      await env?.load?.(true);
      return;
    case 'pause_embed':
      env?.smart_sources?.entities_vector_adapter?.halt_embed_queue_processing?.();
      return;
    case 'resume_embed':
      env?.smart_sources?.entities_vector_adapter?.resume_embed_queue_processing?.();
      return;
    case 'run_reimport':
      await env?.run_re_import?.();
      return;
    case 'open_notifications':
      env?.open_notifications_feed_modal?.();
      return;
    default:
      return;
  }
}
