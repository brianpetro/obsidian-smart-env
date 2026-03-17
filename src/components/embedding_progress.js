import styles from './embedding_progress.css';
import {
  get_embed_progress_state,
  get_import_progress_state,
  get_reimport_queue_count,
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
    const view_state = get_mobile_progress_view_state(env);

    title_el.textContent = view_state.title;
    status_el.textContent = view_state.status;
    summary_el.textContent = view_state.summary;

    render_progress(progress_el, progress_fill_el, view_state);
    render_details(details_el, view_state.details);
    render_actions(actions_el, env, view_state);
  };

  const sync_polling = () => {
    if (should_poll(env)) {
      start_polling();
      return;
    }
    stop_polling();
  };

  let polling_interval = null;
  const start_polling = () => {
    if (polling_interval) return;
    polling_interval = setInterval(() => {
      render_state();
      sync_polling();
    }, 1000);
  };

  const stop_polling = () => {
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
      sync_polling();
    }, 100);
  };

  render_state();
  sync_polling();

  const disposers = [];
  if (typeof env?.events?.on === 'function') {
    disposers.push(env.events.on('*', refresh));
  }
  disposers.push(() => {
    stop_polling();
    if (debounce_timeout) clearTimeout(debounce_timeout);
  });
  this.attach_disposer(container, disposers);
}

/**
 * @param {any} env
 * @returns {boolean}
 */
function should_poll(env) {
  if (env?.state === 'loading') return true;
  if (get_import_progress_state(env)?.active) return true;
  if (get_embed_progress_state(env)?.active) return true;
  return false;
}

/**
 * @param {any} env
 * @returns {object}
 */
function get_mobile_progress_view_state(env) {
  const import_progress = get_import_progress_state(env);
  const embed_progress = get_embed_progress_state(env);
  const reimport_queue_count = get_reimport_queue_count(env);

  if (embed_progress?.active) {
    const progress = normalize_number(embed_progress.progress);
    const total = normalize_number(embed_progress.total);
    const paused = Boolean(embed_progress.paused);
    const tokens_per_second = normalize_number(embed_progress.tokens_per_second);
    const model_name = to_non_empty_string(embed_progress.model_name);
    const reason = to_non_empty_string(embed_progress.reason);

    return {
      title: paused ? 'Embedding paused' : 'Embedding in progress',
      status: `${progress}/${total}`,
      summary: model_name
        ? `Using ${model_name} for embeddings.`
        : 'Generating embeddings for imported content.',
      progress_value: progress,
      progress_total: total,
      progress_pct: get_progress_pct(progress, total),
      details: [
        tokens_per_second > 0 ? `${tokens_per_second} tokens/sec` : '',
        reason,
        reimport_queue_count > 0 ? `${reimport_queue_count} source${reimport_queue_count === 1 ? '' : 's'} still queued for re-import.` : '',
      ].filter(Boolean),
      actions: [paused ? 'resume_embed' : 'pause_embed'],
    };
  }

  if (import_progress?.active) {
    const progress = normalize_number(import_progress.progress);
    const total = normalize_number(import_progress.total);
    const stage = to_non_empty_string(import_progress.stage) || 'importing';
    const title = stage === 'reimporting'
      ? 'Re-importing sources'
      : 'Importing sources'
    ;
    const summary = stage === 'reimporting'
      ? 'Refreshing queued source changes before embeddings continue.'
      : 'Discovering and importing sources into Smart Environment.'
    ;

    return {
      title,
      status: `${progress}/${total}`,
      summary,
      progress_value: progress,
      progress_total: total,
      progress_pct: get_progress_pct(progress, total),
      details: [
        reimport_queue_count > 0 ? `${reimport_queue_count} additional source${reimport_queue_count === 1 ? '' : 's'} queued.` : '',
        env?.state === 'loading' ? 'Smart Environment is still loading in the background.' : '',
      ].filter(Boolean),
      actions: [],
    };
  }

  if (env?.state === 'loading') {
    return {
      title: 'Loading Smart Environment',
      status: 'In progress',
      summary: 'Preparing collections, sources, and shared plugin state.',
      progress_value: null,
      progress_total: null,
      progress_pct: null,
      details: [
        reimport_queue_count > 0 ? `${reimport_queue_count} source${reimport_queue_count === 1 ? '' : 's'} queued for re-import after load.` : '',
        'This sidebar stays available on mobile while loading continues.',
      ].filter(Boolean),
      actions: [],
    };
  }

  if (reimport_queue_count > 0) {
    return {
      title: 'Queued re-import work',
      status: `${reimport_queue_count} queued`,
      summary: 'Run re-import to refresh changed sources and resume downstream embedding work.',
      progress_value: null,
      progress_total: null,
      progress_pct: null,
      details: [],
      actions: ['run_reimport'],
    };
  }

  if (env?.state === 'loaded') {
    return {
      title: 'Smart Environment ready',
      status: 'Ready',
      summary: 'No active import or embedding work is running right now.',
      progress_value: null,
      progress_total: null,
      progress_pct: null,
      details: [],
      actions: ['open_notifications'],
    };
  }

  return {
    title: 'Smart Environment not loaded',
    status: 'Idle',
    summary: 'Load Smart Environment to import sources and begin embedding work.',
    progress_value: null,
    progress_total: null,
    progress_pct: null,
    details: [
      'On mobile, this item view remains accessible from the sidebar while loading and embedding continue.',
    ],
    actions: ['load_env'],
  };
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
 * @param {object} view_state
 * @returns {void}
 */
function render_actions(actions_el, env, view_state) {
  actions_el.replaceChildren();

  view_state.actions.forEach((action_key) => {
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

/**
 * @param {number|null} progress
 * @param {number|null} total
 * @returns {number|null}
 */
function get_progress_pct(progress, total) {
  if (typeof progress !== 'number' || typeof total !== 'number') return null;
  if (total <= 0) return null;
  return Math.round((progress / total) * 1000) / 10;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalize_number(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : 0
  ;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function to_non_empty_string(value) {
  return typeof value === 'string' ? value.trim() : '';
}
