/**
 * Environment statistics component.
 *
 * The component paints immediately, scans sources and blocks in bounded chunks,
 * and uses persisted embedding references instead of resolving item.vec for
 * every entity. This keeps large-vault diagnostics responsive and avoids the
 * typed-array churn caused by the previous multi-pass implementation.
 */

import { run_action_entry } from 'smart-environment/utils/action_entry.js';
import { convert_to_human_readable_size } from 'smart-utils/convert_to_human_readable_size.js';
import styles from './env_stats.css';
import { format_collection_name } from '../utils/format_collection_name.js';
import {
  collect_environment_stats,
  get_embeddings_file_info,
  has_current_embedding,
} from '../utils/env_stats.js';

const COLLECTION_KEYS = [
  'smart_sources',
  'smart_blocks',
];
const CACHE_FRESH_MS = 10000;
const stats_cache = new WeakMap();
const number_formatter = new Intl.NumberFormat();

/**
 * Build the immediately visible stats shell.
 *
 * @returns {string}
 */
export function build_html() {
  return `<section class="smart-env-stats" aria-busy="true">
    <header class="smart-env-stats__header">
      <div class="smart-env-stats__heading">
        <div class="smart-env-stats__eyebrow">Index diagnostics</div>
        <h2 class="smart-env-stats__title">Embedding health</h2>
        <p class="smart-env-stats__status" aria-live="polite">Preparing exact stats...</p>
      </div>
      <button class="smart-env-stats__refresh" type="button">Refresh</button>
    </header>

    <div class="smart-env-stats__summary" aria-label="Environment summary">
      ${build_metric_html('total_items', 'Indexed items')}
      ${build_metric_html('should_embed', 'Eligible')}
      ${build_metric_html('vectorized', 'Current embeddings')}
      ${build_metric_html('missing_embed', 'Needs embedding')}
    </div>

    <section class="smart-env-stats__section smart-env-stats__memory-section">
      <div class="smart-env-stats__section-heading">
        <div>
          <h3>Vector memory</h3>
          <p>Loaded embedding vectors and reserved capacity.</p>
        </div>
        <div class="smart-env-stats__memory-utilization" data-memory-utilization>-</div>
      </div>
      <div class="smart-env-stats__memory-grid">
        ${build_metric_html('memory_used', 'Used')}
        ${build_metric_html('memory_allocated', 'Allocated')}
        ${build_metric_html('memory_unused', 'Available capacity')}
      </div>
    </section>

    <section class="smart-env-stats__section">
      <div class="smart-env-stats__section-heading">
        <div>
          <h3>Collections</h3>
          <p>Coverage uses the current model, vector file, and content hash.</p>
        </div>
      </div>
      <div class="smart-env-stats__collections"></div>
    </section>

    <footer class="smart-env-stats__footer" aria-live="polite"></footer>
  </section>`;
}

/**
 * @param {object} env
 * @param {object} [opts]
 * @returns {Promise<HTMLElement>}
 */
export async function render(env, opts = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html(env, opts));
  const container = frag.firstElementChild;
  post_process.call(this, env, container, opts);
  return container;
}

/**
 * Bind the stats shell and start the non-blocking scan after the component can
 * be appended to the modal.
 *
 * @param {object} env
 * @param {HTMLElement} container
 * @param {object} [opts]
 * @returns {HTMLElement}
 */
export function post_process(env, container, opts = {}) {
  if (!container) return container;

  const status_el = container.querySelector('.smart-env-stats__status');
  const refresh_btn = container.querySelector('.smart-env-stats__refresh');
  const collections_el = container.querySelector('.smart-env-stats__collections');
  const footer_el = container.querySelector('.smart-env-stats__footer');
  let disposed = false;
  let scan_id = 0;
  let start_timeout = null;

  COLLECTION_KEYS.forEach((collection_key) => {
    ensure_collection_card(collections_el, collection_key);
  });

  const load_stats = async ({ force = false } = {}) => {
    const current_scan_id = ++scan_id;
    const cached = stats_cache.get(env);
    const cache_age_ms = cached
      ? Math.max(0, Date.now() - cached.calculated_at)
      : Number.POSITIVE_INFINITY
    ;

    if (cached) {
      render_stats(container, cached);
      set_text(
        status_el,
        cache_age_ms < CACHE_FRESH_MS
          ? `Showing stats calculated ${format_age(cache_age_ms)}.`
          : 'Showing the previous result while exact stats refresh...',
      );
    }

    if (!force && cached && cache_age_ms < CACHE_FRESH_MS) {
      container.setAttribute('aria-busy', 'false');
      set_button_loading(refresh_btn, false);
      return;
    }

    container.setAttribute('aria-busy', 'true');
    set_button_loading(refresh_btn, true);
    set_text(status_el, 'Scanning collection metadata...');
    set_text(footer_el, '');

    const started_at = now_ms();
    const memory_usage_promise = get_vector_memory_usage(env).then((memory_usage) => {
      if (!disposed && current_scan_id === scan_id) {
        render_memory_stats(container, memory_usage);
      }
      return memory_usage;
    });

    const stats = await collect_environment_stats(env, {
      collection_keys: COLLECTION_KEYS,
      is_cancelled: () => disposed || current_scan_id !== scan_id,
      on_progress: ({ collection_key, collection_stats }) => {
        if (disposed || current_scan_id !== scan_id) return;
        render_collection_progress(
          ensure_collection_card(collections_el, collection_key),
          collection_stats,
        );
        set_text(
          status_el,
          `Scanning ${format_collection_name(collection_key)}: ${format_number(collection_stats.scanned_items)} of ${format_number(collection_stats.total_items)}...`,
        );
      },
      on_collection: (collection_stats) => {
        if (disposed || current_scan_id !== scan_id) return;
        render_collection_stats(
          ensure_collection_card(collections_el, collection_stats.collection_key),
          collection_stats,
        );
      },
    });

    if (disposed || current_scan_id !== scan_id || stats.cancelled) return;
    const memory_usage = await memory_usage_promise;
    if (disposed || current_scan_id !== scan_id) return;

    const result = {
      ...stats,
      memory_usage,
      total_time_ms: Math.max(0, Math.round(now_ms() - started_at)),
      calculated_at: Date.now(),
    };
    stats_cache.set(env, result);
    render_stats(container, result);
    set_text(
      status_el,
      `Scanned ${format_number(result.totals.scanned_items)} items in ${format_duration(result.total_time_ms)}.`,
    );
    set_text(
      footer_el,
      `Calculated ${format_clock_time(result.calculated_at)} / one metadata pass per collection`,
    );
    container.setAttribute('aria-busy', 'false');
    set_button_loading(refresh_btn, false);
  };

  const handle_load_error = (error) => {
    if (disposed) return;
    console.error('[env_stats] Failed to calculate stats', error);
    set_text(status_el, 'Failed to calculate stats. See the developer console for details.');
    container.setAttribute('aria-busy', 'false');
    set_button_loading(refresh_btn, false);
  };

  const handle_refresh = () => {
    if (start_timeout) {
      clearTimeout(start_timeout);
      start_timeout = null;
    }
    load_stats({ force: true }).catch(handle_load_error);
  };
  refresh_btn?.addEventListener('click', handle_refresh);

  start_timeout = setTimeout(() => {
    start_timeout = null;
    load_stats({ force: Boolean(opts.force_refresh) }).catch(handle_load_error);
  }, 0);

  this.attach_disposer?.(container, () => {
    disposed = true;
    scan_id += 1;
    if (start_timeout) clearTimeout(start_timeout);
    refresh_btn?.removeEventListener('click', handle_refresh);
  });

  return container;
}

/**
 * Compatibility helper for callers that still expect an HTML coverage snippet.
 * Uses one item pass and never resolves item.vec.
 *
 * @param {object} collection
 * @returns {string}
 */
export function calculate_embed_coverage(collection) {
  const items = collection?.items || {};
  const embeddings = collection?.embeddings;
  const file_info = get_embeddings_file_info(embeddings);
  const stats = {
    should_embed: 0,
    should_not_embed: 0,
    embedded: 0,
    missing_embed: 0,
    extraneous_embed: 0,
  };

  for (const item_key in items) {
    const item = items[item_key];
    let should_embed = false;
    try {
      should_embed = Boolean(item?.should_embed);
    } catch {
      should_embed = false;
    }
    const vectorized = has_current_embedding(item, embeddings, file_info);

    if (should_embed) stats.should_embed += 1;
    else stats.should_not_embed += 1;
    if (should_embed && vectorized) stats.embedded += 1;
    if (should_embed && !vectorized) stats.missing_embed += 1;
    if (!should_embed && vectorized) stats.extraneous_embed += 1;
  }

  if (!stats.should_embed) {
    return '<p>No items eligible for embedding.</p>'
      + (stats.extraneous_embed ? `<p><strong>Unexpected embeddings:</strong> ${stats.extraneous_embed}</p>` : '')
      + (stats.should_not_embed ? `<p><strong>Embedding skipped:</strong> ${stats.should_not_embed}</p>` : '')
    ;
  }

  const percent = stats.should_embed
    ? Math.round((stats.embedded / stats.should_embed) * 100)
    : 0
  ;
  return `<p><strong>Embedding coverage:</strong> ${percent}% (${stats.embedded} / ${stats.should_embed})</p>`
    + (stats.missing_embed ? `<p><strong>Missing embeddings:</strong> ${stats.missing_embed}</p>` : '')
    + (stats.extraneous_embed ? `<p><strong>Unexpected embeddings:</strong> ${stats.extraneous_embed}</p>` : '')
    + (stats.should_not_embed ? `<p><strong>Embedding skipped:</strong> ${stats.should_not_embed}</p>` : '')
  ;
}

/**
 * @param {string} key
 * @param {string} label
 * @returns {string}
 */
function build_metric_html(key, label) {
  return `<div class="smart-env-stats__metric" data-metric="${key}">
    <div class="smart-env-stats__metric-label">${label}</div>
    <div class="smart-env-stats__metric-value">-</div>
    <div class="smart-env-stats__metric-detail"></div>
  </div>`;
}

/**
 * @param {HTMLElement} container
 * @param {object} result
 * @returns {void}
 */
function render_stats(container, result) {
  render_memory_stats(container, result.memory_usage);
  render_summary_stats(container, result.totals);

  const collections_el = container.querySelector('.smart-env-stats__collections');
  result.collections?.forEach((stats) => {
    render_collection_stats(
      ensure_collection_card(collections_el, stats.collection_key),
      stats,
    );
  });

  const footer_el = container.querySelector('.smart-env-stats__footer');
  if (result.calculated_at) {
    set_text(
      footer_el,
      `Calculated ${format_clock_time(result.calculated_at)} / ${format_duration(result.total_time_ms)} total`,
    );
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} totals
 * @returns {void}
 */
function render_summary_stats(container, totals = {}) {
  set_metric(container, 'total_items', format_number(totals.total_items), 'Sources + blocks');
  set_metric(container, 'should_embed', format_number(totals.should_embed), `${format_number(totals.should_not_embed)} skipped`);
  set_metric(container, 'vectorized', format_number(totals.vectorized), format_percent(totals.coverage_percent));
  set_metric(
    container,
    'missing_embed',
    format_number(totals.missing_embed),
    totals.extraneous_embed
      ? `${format_number(totals.extraneous_embed)} unexpected`
      : totals.missing_embed
        ? 'Eligible without a current vector'
        : 'All eligible items are current',
  );

  const missing_metric = container.querySelector('[data-metric="missing_embed"]');
  missing_metric?.toggleAttribute('data-attention', Number(totals.missing_embed || 0) > 0);
}

/**
 * @param {HTMLElement} container
 * @param {object} memory_usage
 * @returns {void}
 */
function render_memory_stats(container, memory_usage = {}) {
  if (memory_usage?.error) {
    set_metric(container, 'memory_used', 'Unavailable', memory_usage.error);
    set_metric(container, 'memory_allocated', '-', '');
    set_metric(container, 'memory_unused', '-', '');
    set_text(container.querySelector('[data-memory-utilization]'), 'Unavailable');
    return;
  }

  const used_bytes = Number(memory_usage?.used_bytes || 0);
  const allocated_bytes = Number(memory_usage?.allocated_bytes || 0);
  const unused_capacity_bytes = Number(memory_usage?.unused_capacity_bytes || 0);
  const utilization = allocated_bytes
    ? Math.round((used_bytes / allocated_bytes) * 100)
    : 0
  ;

  set_metric(container, 'memory_used', format_bytes(used_bytes), `${format_number(used_bytes)} bytes`);
  set_metric(container, 'memory_allocated', format_bytes(allocated_bytes), `${format_number(allocated_bytes)} bytes`);
  set_metric(container, 'memory_unused', format_bytes(unused_capacity_bytes), `${format_number(unused_capacity_bytes)} bytes`);
  set_text(
    container.querySelector('[data-memory-utilization]'),
    allocated_bytes ? `${utilization}% utilized` : 'No vectors loaded',
  );
}

/**
 * @param {HTMLElement} collections_el
 * @param {string} collection_key
 * @returns {HTMLElement|null}
 */
function ensure_collection_card(collections_el, collection_key) {
  if (!collections_el) return null;
  let card = collections_el.querySelector(`[data-collection-key="${collection_key}"]`);
  if (card) return card;

  card = collections_el.ownerDocument.createElement('article');
  card.className = 'smart-env-stats__collection';
  card.dataset.collectionKey = collection_key;
  card.innerHTML = `<div class="smart-env-stats__collection-header">
      <div>
        <h4>${format_collection_name(collection_key)}</h4>
        <div class="smart-env-stats__collection-state">Preparing...</div>
      </div>
      <div class="smart-env-stats__coverage-value">-</div>
    </div>
    <div class="smart-env-stats__progress" role="progressbar" aria-valuemin="0" aria-valuemax="100">
      <div class="smart-env-stats__progress-fill"></div>
    </div>
    <div class="smart-env-stats__collection-grid">
      ${build_collection_value_html('total', 'Total')}
      ${build_collection_value_html('eligible', 'Eligible')}
      ${build_collection_value_html('current', 'Current')}
      ${build_collection_value_html('missing', 'Missing')}
      ${build_collection_value_html('skipped', 'Skipped')}
      ${build_collection_value_html('unexpected', 'Unexpected')}
    </div>
    <div class="smart-env-stats__collection-footer"></div>`;
  collections_el.appendChild(card);
  return card;
}

/**
 * @param {string} key
 * @param {string} label
 * @returns {string}
 */
function build_collection_value_html(key, label) {
  return `<div class="smart-env-stats__collection-value" data-value="${key}">
    <span>${label}</span>
    <strong>-</strong>
  </div>`;
}

/**
 * @param {HTMLElement|null} card
 * @param {object} stats
 * @returns {void}
 */
function render_collection_progress(card, stats) {
  if (!card) return;
  const scanned = Number(stats.scanned_items || 0);
  const total = Number(stats.total_items || 0);
  const progress_percent = total ? Math.round((scanned / total) * 100) : 0;

  set_text(
    card.querySelector('.smart-env-stats__collection-state'),
    `Scanning ${format_number(scanned)} / ${format_number(total)}`,
  );
  set_text(card.querySelector('.smart-env-stats__coverage-value'), `${progress_percent}% scanned`);
  set_progress(card, progress_percent, scanned, total);
  card.dataset.tone = 'loading';
}

/**
 * @param {HTMLElement|null} card
 * @param {object} stats
 * @returns {void}
 */
function render_collection_stats(card, stats) {
  if (!card) return;

  const is_loaded = stats.state === 'loaded';
  const coverage_text = is_loaded
    ? format_percent(stats.coverage_percent)
    : 'Not loaded'
  ;
  const state_detail = is_loaded
    ? `${format_number(stats.embedded)} of ${format_number(stats.should_embed)} eligible`
    : `${format_number(stats.total_items)} items known`
  ;

  set_text(card.querySelector('.smart-env-stats__collection-state'), state_detail);
  set_text(card.querySelector('.smart-env-stats__coverage-value'), coverage_text);
  set_collection_value(card, 'total', stats.total_items);
  set_collection_value(card, 'eligible', stats.should_embed);
  set_collection_value(card, 'current', stats.vectorized);
  set_collection_value(card, 'missing', stats.missing_embed);
  set_collection_value(card, 'skipped', stats.should_not_embed);
  set_collection_value(card, 'unexpected', stats.extraneous_embed);
  set_progress(card, stats.coverage_percent || 0, stats.embedded, stats.should_embed);

  const timing_parts = [];
  if (stats.load_time_ms) timing_parts.push(`Loaded in ${format_duration(stats.load_time_ms)}`);
  if (is_loaded) timing_parts.push(`Scanned in ${format_duration(stats.scan_time_ms)}`);
  if (stats.queued) timing_parts.push(`${format_number(stats.queued)} queued`);
  set_text(card.querySelector('.smart-env-stats__collection-footer'), timing_parts.join(' / '));

  if (!is_loaded) card.dataset.tone = 'muted';
  else if (stats.missing_embed) card.dataset.tone = 'attention';
  else if (stats.extraneous_embed) card.dataset.tone = 'warning';
  else card.dataset.tone = 'success';
}

/**
 * @param {HTMLElement} card
 * @param {string} key
 * @param {number} value
 * @returns {void}
 */
function set_collection_value(card, key, value) {
  set_text(
    card.querySelector(`[data-value="${key}"] strong`),
    format_number(value),
  );
}

/**
 * @param {HTMLElement} card
 * @param {number} percent
 * @param {number} value
 * @param {number} total
 * @returns {void}
 */
function set_progress(card, percent, value, total) {
  const progress = card.querySelector('.smart-env-stats__progress');
  const fill = card.querySelector('.smart-env-stats__progress-fill');
  const normalized_percent = Math.max(0, Math.min(100, Number(percent || 0)));
  if (fill) fill.style.width = `${normalized_percent}%`;
  if (!progress) return;
  progress.setAttribute('aria-valuenow', String(Number(value || 0)));
  progress.setAttribute('aria-valuemax', String(Math.max(1, Number(total || 0))));
}

/**
 * @param {HTMLElement} container
 * @param {string} key
 * @param {string} value
 * @param {string} detail
 * @returns {void}
 */
function set_metric(container, key, value, detail) {
  const metric = container.querySelector(`[data-metric="${key}"]`);
  if (!metric) return;
  set_text(metric.querySelector('.smart-env-stats__metric-value'), value);
  set_text(metric.querySelector('.smart-env-stats__metric-detail'), detail);
}

/**
 * @param {HTMLElement|null} button
 * @param {boolean} loading
 * @returns {void}
 */
function set_button_loading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? 'Calculating...' : 'Refresh';
}

/**
 * @param {HTMLElement|null} element
 * @param {*} value
 * @returns {void}
 */
function set_text(element, value) {
  if (!element) return;
  element.textContent = value == null ? '' : String(value);
}

/**
 * @returns {Promise<object>}
 */
async function get_vector_memory_usage(env) {
  try {
    const usage = await run_action_entry(
      env,
      'env_get_embedding_vector_memory_usage',
    );
    return {
      used_bytes: Number(usage?.used_bytes || 0),
      allocated_bytes: Number(usage?.allocated_bytes || 0),
      unused_capacity_bytes: Number(usage?.unused_capacity_bytes || 0),
    };
  } catch (error) {
    console.error('[env_stats] Failed to read vector memory usage', error);
    return {
      error: error?.message || 'Vector memory stats unavailable',
    };
  }
}

/**
 * @param {*} value
 * @returns {string}
 */
function format_number(value) {
  return number_formatter.format(Number(value || 0));
}

/**
 * @param {number|null|undefined} percent
 * @returns {string}
 */
function format_percent(percent) {
  return Number.isFinite(percent) ? `${percent}% coverage` : 'No eligible items';
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function format_bytes(bytes) {
  return convert_to_human_readable_size(Math.max(0, Number(bytes || 0)));
}

/**
 * @param {number} duration_ms
 * @returns {string}
 */
function format_duration(duration_ms) {
  const normalized_ms = Math.max(0, Number(duration_ms || 0));
  if (normalized_ms < 1000) return `${Math.round(normalized_ms)} ms`;
  return `${(normalized_ms / 1000).toFixed(normalized_ms < 10000 ? 1 : 0)} s`;
}

/**
 * @param {number} age_ms
 * @returns {string}
 */
function format_age(age_ms) {
  if (age_ms < 1000) return 'just now';
  return `${Math.max(1, Math.round(age_ms / 1000))}s ago`;
}

/**
 * @param {number} timestamp
 * @returns {string}
 */
function format_clock_time(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * @returns {number}
 */
function now_ms() {
  return globalThis.performance?.now?.() || Date.now();
}
