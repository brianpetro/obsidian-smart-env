import styles from './embedding_progress.css';
import {
  get_env_activity_state,
  should_poll_env_activity,
} from '../utils/status_bar_state.js';

export function build_html() {
  return `<div class="smart-env-embedding-progress">
    <div class="smart-env-embedding-progress__header">
      <div class="smart-env-embedding-progress__eyebrow">Smart Environment</div>
      <h1 class="smart-env-embedding-progress__title"></h1>
      <div class="smart-env-embedding-progress__status" aria-live="polite"></div>
    </div>
    <div class="smart-env-embedding-progress__summary"></div>
    <div
      class="smart-env-embedding-progress__progress"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      hidden
    >
      <div class="smart-env-embedding-progress__progress-fill"></div>
    </div>
    <div class="smart-env-embedding-progress__details"></div>
    <div class="smart-env-embedding-progress__actions"></div>
  </div>`;
}

export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return container;
}

function post_process(env, container, params = {}) {
  const title_el = container.querySelector('.smart-env-embedding-progress__title');
  const status_el = container.querySelector('.smart-env-embedding-progress__status');
  const summary_el = container.querySelector('.smart-env-embedding-progress__summary');
  const progress_el = container.querySelector('.smart-env-embedding-progress__progress');
  const progress_fill_el = container.querySelector('.smart-env-embedding-progress__progress-fill');
  const details_el = container.querySelector('.smart-env-embedding-progress__details');
  const actions_el = container.querySelector('.smart-env-embedding-progress__actions');

  const render_state = () => {
    const view_state = get_env_activity_state(env);

    title_el.textContent = view_state.view_title;
    status_el.textContent = view_state.view_status;
    summary_el.textContent = view_state.view_summary;

    render_progress(progress_el, progress_fill_el, view_state);
    render_details(details_el, view_state.view_details);
    render_actions(actions_el, env, view_state.view_actions);
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
      detail_el.className = 'smart-env-embedding-progress__detail';
      detail_el.textContent = detail;
      details_el.appendChild(detail_el);
    });
}

/**
 * @param {HTMLElement} actions_el
 * @param {any} env
 * @param {string[]} action_keys
 * @returns {void}
 */
function render_actions(actions_el, env, action_keys = []) {
  actions_el.replaceChildren();

  action_keys.forEach((action_key) => {
    const btn = actions_el.ownerDocument.createElement('button');
    btn.type = 'button';
    btn.className = 'smart-env-embedding-progress__btn';
    bind_action_button(btn, env, action_key);
    actions_el.appendChild(btn);
  });
}

/**
 * @param {HTMLButtonElement} btn
 * @param {any} env
 * @param {string} action_key
 * @returns {void}
 */
function bind_action_button(btn, env, action_key) {
  switch (action_key) {
    case 'load_env':
      btn.classList.add('smart-env-embedding-progress__btn--primary');
      btn.textContent = 'Load Smart Environment';
      btn.addEventListener('click', () => {
        env.start_mobile_env_load?.({
          source: 'embedding_progress_view',
          open_progress_view: false,
        });
      });
      return;
    case 'pause_embed':
      btn.textContent = 'Pause embedding';
      btn.addEventListener('click', () => {
        env?.smart_sources?.entities_vector_adapter?.halt_embed_queue_processing?.();
      });
      return;
    case 'resume_embed':
      btn.classList.add('smart-env-embedding-progress__btn--primary');
      btn.textContent = 'Resume embedding';
      btn.addEventListener('click', () => {
        env?.smart_sources?.entities_vector_adapter?.resume_embed_queue_processing?.();
      });
      return;
    case 'run_reimport':
      btn.classList.add('smart-env-embedding-progress__btn--primary');
      btn.textContent = 'Run re-import';
      btn.addEventListener('click', () => {
        env?.run_re_import?.();
      });
      return;
    case 'open_notifications':
      btn.textContent = 'Open events feed';
      btn.addEventListener('click', () => {
        env?.open_notifications_feed_modal?.();
      });
      return;
    default:
      btn.textContent = action_key;
  }
}
