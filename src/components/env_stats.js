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
  collect_collection_inspection_records,
  collect_environment_stats,
} from '../actions/env/show_stats.js';
import { open_source } from '../utils/open_source.js';
import {
  get_embeddings_file_info,
  has_current_embedding,
} from '../utils/embedding_diagnostics.js';
import { collect_vector_file_stats } from '../utils/vector_file_stats.js';

const COLLECTION_KEYS = [
  'smart_sources',
  'smart_blocks',
];
const CACHE_FRESH_MS = 10000;
const stats_cache = new WeakMap();
const INSPECTOR_PAGE_SIZE = 30;
const INSPECTOR_SEARCH_DEBOUNCE_MS = 120;
const INSPECTION_PRESENTATION = {
  skipped: {
    title: 'Skipped items',
    noun: 'skipped items',
    singular_noun: 'skipped item',
    description: 'Not eligible under the current embedding policy, so these items do not reduce coverage. Unexpected vectors are included because they are also skipped.',
  },
  unexpected: {
    title: 'Unexpected vectors',
    noun: 'unexpected vectors',
    singular_noun: 'unexpected vector',
    description: 'Not eligible under the current policy, but a current vector is still stored. Each row explains why the item is now skipped.',
  },
};
const number_formatter = new Intl.NumberFormat();
let inspector_instance_i = 0;

/**
 * Build the immediately visible stats shell.
 *
 * @returns {string}
 */
export function build_html() {
  return `<section class="smart-env-stats" aria-busy="true">
    <header class="smart-env-stats__header">
      <div class="smart-env-stats__heading">
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
          <p>Coverage uses the current model, vector file, and content hash. Select Skipped or Unexpected to inspect items.</p>
        </div>
      </div>
      <div class="smart-env-stats__collections"></div>
      ${build_inspector_html()}
    </section>

    <section class="smart-env-stats__section smart-env-stats__vector-files-section">
      <div class="smart-env-stats__section-heading">
        <div>
          <h3>Vector files</h3>
          <p>Every stored vector file, its on-disk size, and the configured model matching its fingerprint.</p>
        </div>
        <div class="smart-env-stats__vector-files-summary" data-vector-files-summary aria-live="polite">Reading files...</div>
      </div>
      <div class="smart-env-stats__vector-files" data-vector-files>
        ${build_vector_files_loading_html('Reading stored vector files...')}
      </div>
    </section>

    <section class="smart-env-stats__section smart-env-stats__optimization">
      <div class="smart-env-stats__section-heading">
        <div>
          <h3>Clean up unexpected embeddings</h3>
          <p>Optimize source data and vector files to remove unexpected embeddings. This runs separately from Compact.</p>
        </div>
        <button class="smart-env-stats__optimize" type="button" disabled>Optimize</button>
      </div>
      <p class="smart-env-stats__optimization-status" aria-live="polite">Waiting for exact stats...</p>
      <div class="smart-env-stats__optimization-confirm" role="alert" hidden>
        <p>Existing backup files were found. Continuing means prior backup files will be replaced with the current environment data.</p>
        <div class="smart-env-stats__optimization-confirm-actions">
          <button class="mod-warning" type="button" data-action="confirm-source-data-optimization">Replace backups and optimize</button>
          <button type="button" data-action="cancel-source-data-optimization">Cancel</button>
        </div>
      </div>
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
  const inspector_elements = get_inspector_elements(container);
  const optimize_btn = container.querySelector('.smart-env-stats__optimize');
  const optimization_status_el = container.querySelector('.smart-env-stats__optimization-status');
  const optimization_confirm_el = container.querySelector('.smart-env-stats__optimization-confirm');
  const confirm_optimize_btn = optimization_confirm_el.querySelector('[data-action="confirm-source-data-optimization"]');
  const cancel_optimize_btn = optimization_confirm_el.querySelector('[data-action="cancel-source-data-optimization"]');
  const optimization_adapter = env.smart_sources.data_adapter;
  const inspector_cache = new Map();
  const inspector_state = {
    active_trigger: null,
    collection_key: '',
    filtered_records: [],
    load_id: 0,
    load_result: null,
    query: '',
    reason_key: 'all',
    search_timeout: null,
    status: '',
    visible_count: INSPECTOR_PAGE_SIZE,
  };
  const inspector_id = `smart-env-stats-inspector-${++inspector_instance_i}`;
  let disposed = false;
  let scan_id = 0;
  let start_timeout = null;
  let unexpected_embedding_count = 0;
  let optimization_busy = false;
  let optimization_plan = null;

  if (inspector_elements.container) {
    inspector_elements.container.id = inspector_id;
    inspector_elements.container.setAttribute('aria-labelledby', `${inspector_id}-title`);
  }
  if (inspector_elements.title) inspector_elements.title.id = `${inspector_id}-title`;
  COLLECTION_KEYS.forEach((collection_key) => {
    const card = ensure_collection_card(collections_el, collection_key);
    card?.querySelectorAll('[data-inspect-status]').forEach((button) => {
      button.setAttribute('aria-controls', inspector_id);
    });
  });

  const close_inspector = ({ restore_focus = false } = {}) => {
    const active_trigger = inspector_state.active_trigger;
    inspector_state.load_id += 1;
    if (inspector_state.search_timeout) {
      clearTimeout(inspector_state.search_timeout);
      inspector_state.search_timeout = null;
    }
    active_trigger?.removeAttribute('data-selected');
    active_trigger?.setAttribute('aria-expanded', 'false');
    inspector_state.active_trigger = null;
    inspector_state.collection_key = '';
    inspector_state.filtered_records = [];
    inspector_state.load_result = null;
    inspector_state.query = '';
    inspector_state.reason_key = 'all';
    inspector_state.status = '';
    inspector_state.visible_count = INSPECTOR_PAGE_SIZE;
    if (inspector_elements.container) {
      inspector_elements.container.hidden = true;
      inspector_elements.container.setAttribute('aria-busy', 'false');
    }
    if (inspector_elements.search_input) inspector_elements.search_input.value = '';
    if (restore_focus) active_trigger?.focus();
  };

  const show_inspection_result = (result) => {
    inspector_state.load_result = result;
    inspector_state.filtered_records = [];
    inspector_state.query = '';
    inspector_state.reason_key = 'all';
    inspector_state.visible_count = INSPECTOR_PAGE_SIZE;
    if (inspector_elements.search_input) inspector_elements.search_input.value = '';
    render_inspector_reason_options(inspector_elements.reason_select, result.reasons);
    apply_inspector_filters(inspector_elements, inspector_state);
    set_inspector_loading(inspector_elements, false);
  };

  const show_optimization_count = () => {
    const noun = unexpected_embedding_count === 1 ? 'embedding' : 'embeddings';
    optimize_btn.disabled = unexpected_embedding_count === 0;
    optimize_btn.textContent = 'Optimize';
    set_text(
      optimization_status_el,
      unexpected_embedding_count
        ? `${format_number(unexpected_embedding_count)} unexpected ${noun} can be removed.`
        : 'No unexpected embeddings to clean up.',
    );
  };

  const set_optimization_stats = (totals = {}) => {
    unexpected_embedding_count = totals.extraneous_embed || 0;
    if (
      optimization_busy
      || optimization_plan
      || !optimization_confirm_el.hidden
    ) {
      return;
    }
    show_optimization_count();
  };

  const prepare_source_data_optimization = async (replace_existing_backups = false) => {
    optimization_busy = true;
    optimization_confirm_el.hidden = true;
    optimize_btn.disabled = true;
    optimize_btn.textContent = 'Optimizing...';
    set_text(optimization_status_el, 'Preparing optimized source and vector files...');

    try {
      optimization_plan = await optimization_adapter.optimize_source_data({
        replace_existing_backups,
      });
      if (disposed) return;

      const backup_message = replace_existing_backups
        ? 'Prior backup files will be replaced with the current environment data.'
        : 'Current source and vector files will be retained as .backup files.'
      ;
      optimize_btn.disabled = false;
      optimize_btn.textContent = 'Finish optimization';
      set_text(
        optimization_status_el,
        `Optimized files are ready. ${backup_message} Do not change sources or the embedding model before finishing.`,
      );
    } catch (error) {
      if (disposed) return;
      optimization_plan = null;
      optimize_btn.textContent = 'Optimize';

      if (
        !replace_existing_backups
        && error.message.startsWith('Source data optimization backup already exists:')
      ) {
        optimization_confirm_el.hidden = false;
        set_text(optimization_status_el, 'Backup replacement requires confirmation.');
        confirm_optimize_btn.focus();
        return;
      }

      console.error('[env_stats] Failed to optimize source data', error);
      optimize_btn.disabled = unexpected_embedding_count === 0;
      set_text(
        optimization_status_el,
        'Optimization could not be prepared. See the developer console for details.',
      );
    } finally {
      optimization_busy = false;
    }
  };

  const finish_source_data_optimization = async () => {
    optimization_busy = true;
    optimize_btn.disabled = true;
    optimize_btn.textContent = 'Finishing...';
    set_text(optimization_status_el, 'Applying optimized source and vector files...');

    try {
      await optimization_adapter.finish_source_data_optimization(optimization_plan);
    } catch (error) {
      if (disposed) return;
      console.error('[env_stats] Failed to finish source data optimization', {
        error,
        plan: optimization_plan,
      });
      optimize_btn.textContent = 'Finishing failed';
      set_text(
        optimization_status_el,
        'Finishing failed. Close Obsidian and restore the complete .backup file set before restarting. See the developer console for details.',
      );
    } finally {
      optimization_busy = false;
    }
  };

  const load_inspection = async (trigger, { force = false } = {}) => {
    if (!trigger || trigger.disabled) return;

    const card = trigger.closest('[data-collection-key]');
    const collection_key = card?.dataset.collectionKey || '';
    const status = trigger.dataset.inspectStatus || '';
    if (!collection_key || !INSPECTION_PRESENTATION[status]) return;

    const is_current = (
      inspector_state.active_trigger === trigger
      && !inspector_elements.container?.hidden
    );
    if (is_current) {
      close_inspector();
      return;
    }

    close_inspector();
    inspector_state.active_trigger = trigger;
    inspector_state.collection_key = collection_key;
    inspector_state.status = status;
    trigger.dataset.selected = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    configure_inspector(inspector_elements, { collection_key, status });
    if (inspector_elements.container) inspector_elements.container.hidden = false;
    set_inspector_loading(inspector_elements, true);
    inspector_elements.container?.scrollIntoView?.({ block: 'nearest' });

    const cache_key = `${collection_key}:${status}`;
    const cached = !force ? inspector_cache.get(cache_key) : null;
    if (cached) {
      show_inspection_result(cached);
      return;
    }

    const current_load_id = ++inspector_state.load_id;
    try {
      const result = await collect_collection_inspection_records(
        env?.[collection_key],
        {
          collection_key,
          status,
          is_cancelled: () => (
            disposed
            || current_load_id !== inspector_state.load_id
          ),
          on_progress: ({ scanned_items, total_items, matched_items }) => {
            if (disposed || current_load_id !== inspector_state.load_id) return;
            set_text(
              inspector_elements.status,
              `Scanning ${format_number(scanned_items)} of ${format_number(total_items)} items / ${format_number(matched_items)} found...`,
            );
          },
        },
      );

      if (
        disposed
        || current_load_id !== inspector_state.load_id
        || result.cancelled
      ) {
        return;
      }

      inspector_cache.set(cache_key, result);
      show_inspection_result(result);
    } catch (error) {
      if (disposed || current_load_id !== inspector_state.load_id) return;
      console.error('[env_stats] Failed to inspect collection stat', error);
      set_inspector_loading(inspector_elements, false);
      render_inspector_error(inspector_elements, error);
    }
  };

  const load_stats = async ({ force = false } = {}) => {
    const current_scan_id = ++scan_id;
    const cached = stats_cache.get(env);
    const cache_age_ms = cached
      ? Math.max(0, Date.now() - cached.calculated_at)
      : Number.POSITIVE_INFINITY
    ;

    if (cached) {
      render_stats(container, cached);
      set_optimization_stats(cached.totals);
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

    inspector_cache.clear();
    close_inspector();

    if (!optimization_busy && !optimization_plan) {
      optimization_confirm_el.hidden = true;
      optimize_btn.disabled = true;
      optimize_btn.textContent = 'Optimize';
      set_text(optimization_status_el, 'Refreshing exact stats...');
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
    const vector_files_promise = get_vector_file_stats(env).then((vector_files) => {
      if (!disposed && current_scan_id === scan_id) {
        render_vector_file_stats(container, vector_files);
      }
      return vector_files;
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
    const [memory_usage, vector_files] = await Promise.all([
      memory_usage_promise,
      vector_files_promise,
    ]);
    if (disposed || current_scan_id !== scan_id) return;

    const result = {
      ...stats,
      memory_usage,
      vector_files,
      total_time_ms: Math.max(0, Math.round(now_ms() - started_at)),
      calculated_at: Date.now(),
    };
    stats_cache.set(env, result);
    render_stats(container, result);
    set_optimization_stats(result.totals);
    set_text(
      status_el,
      `Scanned ${format_number(result.totals.scanned_items)} items in ${format_duration(result.total_time_ms)}.`,
    );
    container.setAttribute('aria-busy', 'false');
    set_button_loading(refresh_btn, false);
  };

  const handle_load_error = (error) => {
    if (disposed) return;
    console.error('[env_stats] Failed to calculate stats', error);
    if (!optimization_busy && !optimization_plan) {
      optimize_btn.disabled = true;
      set_text(optimization_status_el, 'Exact stats could not be refreshed.');
    }
    set_text(status_el, 'Failed to calculate stats. See the developer console for details.');
    container.setAttribute('aria-busy', 'false');
    set_button_loading(refresh_btn, false);
  };

  const handle_refresh = () => {
    if (start_timeout) {
      clearTimeout(start_timeout);
      start_timeout = null;
    }
    inspector_cache.clear();
    close_inspector();
    load_stats({ force: true }).catch(handle_load_error);
  };

  const handle_collection_click = (event) => {
    const trigger = event.target?.closest?.('button[data-inspect-status]');
    if (!trigger || !collections_el?.contains(trigger)) return;
    load_inspection(trigger).catch((error) => {
      if (disposed) return;
      console.error('[env_stats] Failed to open collection inspector', error);
      set_inspector_loading(inspector_elements, false);
      render_inspector_error(inspector_elements, error);
    });
  };

  const handle_inspector_search = (event) => {
    inspector_state.query = String(event.currentTarget?.value || '').trim().toLowerCase();
    if (inspector_state.search_timeout) clearTimeout(inspector_state.search_timeout);
    inspector_state.search_timeout = setTimeout(() => {
      inspector_state.search_timeout = null;
      inspector_state.visible_count = INSPECTOR_PAGE_SIZE;
      apply_inspector_filters(inspector_elements, inspector_state);
    }, INSPECTOR_SEARCH_DEBOUNCE_MS);
  };

  const handle_reason_change = (event) => {
    inspector_state.reason_key = event.currentTarget?.value || 'all';
    inspector_state.visible_count = INSPECTOR_PAGE_SIZE;
    apply_inspector_filters(inspector_elements, inspector_state);
  };

  const handle_load_more = () => {
    inspector_state.visible_count += INSPECTOR_PAGE_SIZE;
    render_inspector_records(inspector_elements, inspector_state);
  };

  const handle_close_inspector = () => {
    close_inspector({ restore_focus: true });
  };

  const handle_inspector_list_click = async (event) => {
    const button = event.target?.closest?.('[data-open-record-index]');
    if (!button || !inspector_elements.list?.contains(button)) return;
    const record_i = Number(button.dataset.openRecordIndex);
    const record = inspector_state.filtered_records[record_i];
    if (!record?.item) return;

    const idle_label = button.textContent;
    button.disabled = true;
    button.textContent = 'Opening...';
    try {
      await open_source(record.item, event);
    } catch (error) {
      console.error('[env_stats] Failed to open inspected item', error);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = idle_label;
      }
    }
  };

  const handle_optimize_source_data = () => {
    if (optimization_busy) return;
    if (optimization_plan) {
      finish_source_data_optimization();
      return;
    }
    if (unexpected_embedding_count === 0) return;
    prepare_source_data_optimization();
  };

  const handle_confirm_source_data_optimization = () => {
    if (optimization_busy) return;
    prepare_source_data_optimization(true);
  };

  const handle_cancel_source_data_optimization = () => {
    if (optimization_busy) return;
    optimization_confirm_el.hidden = true;
    show_optimization_count();
    optimize_btn.focus();
  };

  refresh_btn?.addEventListener('click', handle_refresh);
  collections_el?.addEventListener('click', handle_collection_click);
  inspector_elements.search_input?.addEventListener('input', handle_inspector_search);
  inspector_elements.reason_select?.addEventListener('change', handle_reason_change);
  inspector_elements.load_more_btn?.addEventListener('click', handle_load_more);
  inspector_elements.close_btn?.addEventListener('click', handle_close_inspector);
  inspector_elements.list?.addEventListener('click', handle_inspector_list_click);
  optimize_btn.addEventListener('click', handle_optimize_source_data);
  confirm_optimize_btn.addEventListener('click', handle_confirm_source_data_optimization);
  cancel_optimize_btn.addEventListener('click', handle_cancel_source_data_optimization);

  start_timeout = setTimeout(() => {
    start_timeout = null;
    load_stats({ force: Boolean(opts.force_refresh) }).catch(handle_load_error);
  }, 0);

  this.attach_disposer?.(container, () => {
    disposed = true;
    scan_id += 1;
    inspector_state.load_id += 1;
    if (start_timeout) clearTimeout(start_timeout);
    if (inspector_state.search_timeout) clearTimeout(inspector_state.search_timeout);
    refresh_btn?.removeEventListener('click', handle_refresh);
    collections_el?.removeEventListener('click', handle_collection_click);
    inspector_elements.search_input?.removeEventListener('input', handle_inspector_search);
    inspector_elements.reason_select?.removeEventListener('change', handle_reason_change);
    inspector_elements.load_more_btn?.removeEventListener('click', handle_load_more);
    inspector_elements.close_btn?.removeEventListener('click', handle_close_inspector);
    inspector_elements.list?.removeEventListener('click', handle_inspector_list_click);
    optimize_btn.removeEventListener('click', handle_optimize_source_data);
    confirm_optimize_btn.removeEventListener('click', handle_confirm_source_data_optimization);
    cancel_optimize_btn.removeEventListener('click', handle_cancel_source_data_optimization);
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
 * @param {boolean} [inspectable=false]
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
 * @returns {string}
 */
function build_inspector_html() {
  return `<section class="smart-env-stats__inspector" data-collection-inspector hidden aria-busy="false">
    <header class="smart-env-stats__inspector-header">
      <div class="smart-env-stats__inspector-heading">
        <div class="smart-env-stats__inspector-eyebrow" data-inspector-eyebrow>Collection diagnostics</div>
        <h4 data-inspector-title>Collection inspector</h4>
        <p data-inspector-description></p>
      </div>
      <button type="button" data-action="close-inspector">Close</button>
    </header>

    <div class="smart-env-stats__inspector-toolbar">
      <label class="smart-env-stats__inspector-field smart-env-stats__inspector-search">
        <span>Search items</span>
        <input type="search" data-inspector-search placeholder="Path, heading, or reason" autocomplete="off" disabled>
      </label>
      <label class="smart-env-stats__inspector-field">
        <span>Reason</span>
        <select data-inspector-reason disabled>
          <option value="all">All reasons</option>
        </select>
      </label>
    </div>

    <div class="smart-env-stats__inspector-status" data-inspector-status aria-live="polite"></div>
    <div class="smart-env-stats__inspector-list" data-inspector-list role="list"></div>
    <button class="smart-env-stats__inspector-load-more" type="button" data-action="load-more-inspector" hidden>Show more</button>
  </section>`;
}

/**
 * @param {HTMLElement} container
 * @returns {object}
 */
function get_inspector_elements(container) {
  const inspector = container.querySelector('[data-collection-inspector]');
  return {
    container: inspector,
    close_btn: inspector?.querySelector('[data-action="close-inspector"]'),
    description: inspector?.querySelector('[data-inspector-description]'),
    eyebrow: inspector?.querySelector('[data-inspector-eyebrow]'),
    list: inspector?.querySelector('[data-inspector-list]'),
    load_more_btn: inspector?.querySelector('[data-action="load-more-inspector"]'),
    reason_select: inspector?.querySelector('[data-inspector-reason]'),
    search_input: inspector?.querySelector('[data-inspector-search]'),
    status: inspector?.querySelector('[data-inspector-status]'),
    title: inspector?.querySelector('[data-inspector-title]'),
  };
}

/**
 * @param {object} elements
 * @param {object} params
 * @returns {void}
 */
function configure_inspector(elements, params = {}) {
  const { collection_key = '', status = 'skipped' } = params;
  const presentation = INSPECTION_PRESENTATION[status] || INSPECTION_PRESENTATION.skipped;
  const collection_name = format_collection_name(collection_key);

  if (elements.container) {
    elements.container.dataset.status = status;
    delete elements.container.dataset.error;
  }
  set_text(elements.eyebrow, `${collection_name} diagnostics`);
  set_text(elements.title, `${presentation.title} in ${collection_name}`);
  set_text(elements.description, presentation.description);
  set_text(elements.status, 'Preparing item-level diagnostics...');
  if (elements.search_input) elements.search_input.value = '';
  render_inspector_reason_options(elements.reason_select, []);
  if (elements.list) elements.list.innerHTML = build_inspector_loading_html('Scanning item metadata...');
  if (elements.load_more_btn) elements.load_more_btn.hidden = true;
}

/**
 * @param {object} elements
 * @param {boolean} loading
 * @returns {void}
 */
function set_inspector_loading(elements, loading) {
  elements.container?.setAttribute('aria-busy', String(loading));
  if (elements.search_input) elements.search_input.disabled = loading;
  if (elements.reason_select) elements.reason_select.disabled = loading;
  if (loading && elements.load_more_btn) elements.load_more_btn.hidden = true;
}

/**
 * @param {HTMLSelectElement|null} select
 * @param {object[]} reasons
 * @returns {void}
 */
function render_inspector_reason_options(select, reasons = []) {
  if (!select) return;
  const document_ref = select.ownerDocument;
  const total_count = reasons.reduce((total, reason) => total + Number(reason?.count || 0), 0);
  const all_option = document_ref.createElement('option');
  all_option.value = 'all';
  all_option.textContent = total_count
    ? `All reasons (${format_number(total_count)})`
    : 'All reasons'
  ;
  const options = [all_option];

  reasons.forEach((reason) => {
    const option = document_ref.createElement('option');
    option.value = reason.key;
    option.textContent = `${reason.label} (${format_number(reason.count)})`;
    options.push(option);
  });
  select.replaceChildren(...options);
  select.value = 'all';
}

/**
 * @param {object} elements
 * @param {object} state
 * @returns {void}
 */
function apply_inspector_filters(elements, state) {
  const records = state.load_result?.records || [];
  const query = state.query || '';
  const reason_key = state.reason_key || 'all';

  state.filtered_records = records.filter((record) => (
    (reason_key === 'all' || record.reason_key === reason_key)
    && (!query || record.search_text?.includes(query))
  ));
  render_inspector_records(elements, state);
}

/**
 * @param {object} elements
 * @param {object} state
 * @returns {void}
 */
function render_inspector_records(elements, state) {
  if (!elements.list) return;

  const records = state.filtered_records || [];
  const visible_records = records.slice(0, state.visible_count);
  const total_count = Number(state.load_result?.records?.length || 0);
  const visible_count = visible_records.length;
  const is_filtered = Boolean(state.query || state.reason_key !== 'all');
  const presentation = INSPECTION_PRESENTATION[state.status] || INSPECTION_PRESENTATION.skipped;
  const total_noun = total_count === 1 ? presentation.singular_noun : presentation.noun;
  const unexpected_count = Number(state.load_result?.status_counts?.unexpected || 0);
  let status_text;

  if (is_filtered) {
    status_text = records.length > visible_count
      ? `Showing ${format_number(visible_count)} of ${format_number(records.length)} matches (${format_number(total_count)} total)`
      : `${format_number(records.length)} matches (${format_number(total_count)} total)`
    ;
  } else if (total_count > visible_count) {
    status_text = `Showing ${format_number(visible_count)} of ${format_number(total_count)} ${total_noun}`;
  } else {
    status_text = `${format_number(total_count)} ${total_noun}`;
  }
  if (!is_filtered && state.status === 'skipped' && unexpected_count) {
    status_text += `, including ${format_number(unexpected_count)} unexpected ${unexpected_count === 1 ? 'vector' : 'vectors'}`;
  }
  set_text(elements.status, status_text);

  if (!visible_records.length) {
    let empty_message = `No ${presentation.noun} found.`;
    if (total_count && state.query && state.reason_key !== 'all') {
      empty_message = 'No items match this search and reason.';
    } else if (total_count && state.query) {
      empty_message = 'No items match this search.';
    } else if (total_count && state.reason_key !== 'all') {
      empty_message = 'No items match this reason.';
    }
    elements.list.replaceChildren(create_inspector_message(
      elements.list.ownerDocument,
      empty_message,
      'empty',
    ));
  } else {
    const document_ref = elements.list.ownerDocument;
    const fragment = document_ref.createDocumentFragment();
    visible_records.forEach((record, record_i) => {
      fragment.appendChild(create_inspector_record(document_ref, record, record_i));
    });
    elements.list.replaceChildren(fragment);
  }

  if (!elements.load_more_btn) return;
  elements.load_more_btn.hidden = visible_count >= records.length;
  if (!elements.load_more_btn.hidden) {
    const remaining = records.length - visible_count;
    elements.load_more_btn.textContent = `Show ${format_number(Math.min(INSPECTOR_PAGE_SIZE, remaining))} more`;
  }
}

/**
 * @param {Document} document_ref
 * @param {object} record
 * @param {number} record_i
 * @returns {HTMLElement}
 */
function create_inspector_record(document_ref, record, record_i) {
  const article = document_ref.createElement('article');
  article.className = 'smart-env-stats__inspector-record';
  article.dataset.tone = record.status_key || 'skipped';
  article.setAttribute('role', 'listitem');

  const identity = document_ref.createElement('div');
  identity.className = 'smart-env-stats__inspector-record-identity';
  const title = document_ref.createElement('h5');
  title.textContent = format_inspection_record_label(record);
  title.title = record.key || '';

  const metadata = document_ref.createElement('div');
  metadata.className = 'smart-env-stats__inspector-record-metadata';
  metadata.appendChild(create_inspector_badge(document_ref, record.status_key));
  append_metadata_value(metadata, record.item_type === 'block' ? 'Block' : 'Source');
  if (Number.isFinite(record.size)) {
    append_metadata_value(
      metadata,
      `${format_number(record.size)} ${Number(record.size) === 1 ? 'char' : 'chars'}`,
    );
  }
  if (record.line_start && record.line_end) {
    append_metadata_value(metadata, `Lines ${record.line_start}-${record.line_end}`);
  }
  if (record.file_type) append_metadata_value(metadata, format_file_type(record.file_type));

  const reason = document_ref.createElement('p');
  reason.className = 'smart-env-stats__inspector-record-reason';
  const reason_label = document_ref.createElement('strong');
  reason_label.textContent = record.reason_label;
  reason.appendChild(reason_label);
  if (record.reason_detail) reason.append(`. ${record.reason_detail}`);

  identity.append(title, metadata, reason);

  const action = document_ref.createElement('button');
  action.type = 'button';
  action.dataset.openRecordIndex = String(record_i);
  action.textContent = 'Open note';
  article.append(identity, action);
  return article;
}

/**
 * @param {Document} document_ref
 * @param {string} status_key
 * @returns {HTMLElement}
 */
function create_inspector_badge(document_ref, status_key) {
  const badge = document_ref.createElement('span');
  badge.className = 'smart-env-stats__inspector-badge';
  badge.dataset.tone = status_key || 'skipped';
  badge.textContent = status_key === 'unexpected' ? 'Unexpected vector' : 'Skipped';
  badge.title = status_key === 'unexpected'
    ? 'Not eligible, but a current vector is still stored.'
    : 'Not eligible and no current vector is stored.'
  ;
  return badge;
}

/**
 * @param {HTMLElement} container
 * @param {string} value
 * @returns {void}
 */
function append_metadata_value(container, value) {
  const element = container.ownerDocument.createElement('span');
  element.textContent = value;
  container.appendChild(element);
}

/**
 * @param {object} record
 * @returns {string}
 */
function format_inspection_record_label(record) {
  const key = String(record?.key || 'Unknown item');
  const [source_key, ...block_parts] = key.split('#');
  const block_label = block_parts.filter(Boolean).join(' > ');
  return block_label ? `${source_key} > ${block_label}` : source_key;
}

/**
 * @param {string} file_type
 * @returns {string}
 */
function format_file_type(file_type) {
  const normalized_file_type = String(file_type || '');
  if (!normalized_file_type) return '';
  return normalized_file_type.startsWith('.')
    ? normalized_file_type
    : `.${normalized_file_type}`
  ;
}

/**
 * @param {object} elements
 * @param {Error} error
 * @returns {void}
 */
function render_inspector_error(elements, error) {
  const message = error?.message || 'Unknown error';
  if (elements.container) elements.container.dataset.error = 'true';
  set_text(elements.status, 'Collection inspection failed.');
  if (elements.search_input) elements.search_input.disabled = true;
  if (elements.reason_select) elements.reason_select.disabled = true;
  if (elements.list) {
    elements.list.replaceChildren(create_inspector_message(
      elements.list.ownerDocument,
      `${message}. See the developer console for details.`,
      'error',
    ));
  }
  if (elements.load_more_btn) elements.load_more_btn.hidden = true;
}

/**
 * @param {Document} document_ref
 * @param {string} message
 * @param {'empty'|'error'} tone
 * @returns {HTMLElement}
 */
function create_inspector_message(document_ref, message, tone = 'empty') {
  const element = document_ref.createElement('div');
  element.className = `smart-env-stats__inspector-${tone}`;
  element.textContent = message;
  return element;
}

/**
 * @param {string} message
 * @returns {string}
 */
function build_vector_files_loading_html(message) {
  return `<div class="smart-env-stats__vector-files-loading">
    <span class="smart-env-stats__inspector-spinner" aria-hidden="true"></span>
    <span>${message}</span>
  </div>`;
}

/**
 * @param {string} message
 * @returns {string}
 */
function build_inspector_loading_html(message) {
  return `<div class="smart-env-stats__inspector-loading">
    <span class="smart-env-stats__inspector-spinner" aria-hidden="true"></span>
    <span>${message}</span>
  </div>`;
}

/**
 * @param {HTMLElement} container
 * @param {object} result
 * @returns {void}
 */
function render_stats(container, result) {
  render_memory_stats(container, result.memory_usage);
  render_vector_file_stats(container, result.vector_files);
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
      `Calculated ${format_clock_time(result.calculated_at)}`,
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
 * @param {HTMLElement} container
 * @param {object} result
 * @returns {void}
 */
function render_vector_file_stats(container, result = {}) {
  const summary_el = container.querySelector('[data-vector-files-summary]');
  const files_el = container.querySelector('[data-vector-files]');
  if (!files_el) return;

  const files = result?.files || [];
  const errors = result?.errors || [];
  const unknown_size_count = Number(result?.unknown_size_count || 0);
  const known_size_count = Math.max(0, files.length - unknown_size_count);
  const file_noun = files.length === 1 ? 'file' : 'files';
  let summary_text = `${format_number(files.length)} vector ${file_noun}`;
  if (known_size_count) {
    summary_text += ` / ${format_bytes(result.total_bytes)} on disk`;
  }
  if (unknown_size_count) {
    summary_text += ` / ${format_number(unknown_size_count)} ${unknown_size_count === 1 ? 'size' : 'sizes'} unavailable`;
  }
  set_text(summary_el, summary_text);

  const document_ref = files_el.ownerDocument;
  const fragment = document_ref.createDocumentFragment();
  if (!files.length) {
    fragment.appendChild(create_vector_file_message(
      document_ref,
      errors.length
        ? 'No vector files could be read from the configured collections.'
        : 'No vector files found.',
      errors.length ? 'error' : 'empty',
    ));
  } else {
    files.forEach((file) => {
      fragment.appendChild(create_vector_file_record(document_ref, file));
    });
  }

  errors.forEach((error) => {
    fragment.appendChild(create_vector_file_message(
      document_ref,
      `${format_collection_name(error.collection_key)}: ${error.message}`,
      'error',
    ));
  });
  files_el.replaceChildren(fragment);
}

/**
 * @param {Document} document_ref
 * @param {object} file
 * @returns {HTMLElement}
 */
function create_vector_file_record(document_ref, file) {
  const article = document_ref.createElement('article');
  article.className = 'smart-env-stats__vector-file';
  article.dataset.kind = file.file_kind || 'canonical';
  if (file.active) article.dataset.active = 'true';
  if (file.stat_error) article.dataset.error = 'true';

  const identity = document_ref.createElement('div');
  identity.className = 'smart-env-stats__vector-file-identity';
  const title = document_ref.createElement('h4');
  title.textContent = file.configured
    ? file.model_names.join(' / ')
    : 'Unrecognized model fingerprint'
  ;

  const metadata = document_ref.createElement('div');
  metadata.className = 'smart-env-stats__vector-file-metadata';
  append_metadata_value(metadata, format_collection_name(file.collection_key));
  if (file.configured && file.model_keys.length) {
    append_metadata_value(metadata, file.model_keys.join(' / '));
  }
  if (file.fingerprint_type === 'legacy') {
    append_metadata_value(metadata, 'Legacy fingerprint');
  }
  const file_name = document_ref.createElement('code');
  file_name.textContent = file.file_name;
  file_name.title = file.path;
  metadata.appendChild(file_name);
  identity.append(title, metadata);

  const file_stats = document_ref.createElement('div');
  file_stats.className = 'smart-env-stats__vector-file-stats';
  const status = document_ref.createElement('span');
  status.className = 'smart-env-stats__vector-file-badge';
  status.dataset.kind = file.active ? 'active' : file.file_kind || 'canonical';
  status.textContent = get_vector_file_status_label(file);
  const size = document_ref.createElement('strong');
  size.textContent = Number.isFinite(file.size_bytes)
    ? format_bytes(file.size_bytes)
    : 'Unavailable'
  ;
  const size_detail = document_ref.createElement('span');
  size_detail.textContent = Number.isFinite(file.size_bytes)
    ? `${format_number(file.size_bytes)} bytes`
    : file.stat_error || 'File size unavailable'
  ;
  file_stats.append(status, size, size_detail);

  article.append(identity, file_stats);
  return article;
}

/**
 * @param {object} file
 * @returns {string}
 */
function get_vector_file_status_label(file) {
  if (file.active) return 'Active';
  if (file.file_kind === 'backup') return 'Backup';
  if (file.file_kind === 'temporary') return 'Temporary';
  if (file.file_kind === 'related') return 'Related';
  return 'Stored';
}

/**
 * @param {Document} document_ref
 * @param {string} message
 * @param {'empty'|'error'} tone
 * @returns {HTMLElement}
 */
function create_vector_file_message(document_ref, message, tone = 'empty') {
  const element = document_ref.createElement('div');
  element.className = `smart-env-stats__vector-files-${tone}`;
  element.textContent = message;
  return element;
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
      ${build_collection_value_html('skipped', 'Skipped', true)}
      ${build_collection_value_html('unexpected', 'Unexpected', true)}
    </div>`;
  collections_el.appendChild(card);
  return card;
}

/**
 * @param {string} key
 * @param {string} label
 * @returns {string}
 */
function build_collection_value_html(key, label, inspectable = false) {
  const tag_name = inspectable ? 'button' : 'div';
  const attributes = inspectable
    ? ` type="button" data-inspect-status="${key}" aria-expanded="false" disabled`
    : ''
  ;
  const inspect_label = inspectable
    ? '<span class="smart-env-stats__inspect-label" aria-hidden="true">Inspect</span>'
    : ''
  ;
  return `<${tag_name} class="smart-env-stats__collection-value" data-value="${key}"${attributes}>
    <span class="smart-env-stats__collection-value-heading">
      <span class="smart-env-stats__collection-value-label">${label}</span>
      ${inspect_label}
    </span>
    <strong>-</strong>
  </${tag_name}>`;
}

/**
 * @param {HTMLElement|null} card
 * @param {object} stats
 * @returns {void}
 */
function render_collection_progress(card, stats) {
  if (!card) return;
  card.removeAttribute('data-loaded');
  card.querySelectorAll('[data-inspect-status]').forEach((button) => {
    button.disabled = true;
    button.removeAttribute('data-has-items');
    button.removeAttribute('data-selected');
    button.setAttribute('aria-expanded', 'false');
  });
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
  card.toggleAttribute('data-loaded', is_loaded);
  const coverage_text = is_loaded
    ? format_percent(stats.coverage_percent)
    : 'Not loaded'
  ;
  const state_detail = is_loaded
    ? `${format_number(stats.embedded)} of ${format_number(stats.should_embed)} eligible`
    : `${format_number(stats.total_items)} items known`
  ;
  const queue_detail = stats.queued
    ? ` / ${format_number(stats.queued)} queued`
    : ''
  ;

  set_text(
    card.querySelector('.smart-env-stats__collection-state'),
    `${state_detail}${queue_detail}`,
  );
  set_text(card.querySelector('.smart-env-stats__coverage-value'), coverage_text);
  set_collection_value(card, 'total', stats.total_items);
  set_collection_value(card, 'eligible', stats.should_embed);
  set_collection_value(card, 'current', stats.vectorized);
  set_collection_value(card, 'missing', stats.missing_embed);
  set_collection_value(card, 'skipped', stats.should_not_embed);
  set_collection_value(card, 'unexpected', stats.extraneous_embed);
  set_progress(card, stats.coverage_percent || 0, stats.embedded, stats.should_embed);

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
  const value_el = card.querySelector(`[data-value="${key}"]`);
  const numeric_value = Number(value || 0);
  const normalized_value = Number.isFinite(numeric_value)
    ? Math.max(0, numeric_value)
    : 0
  ;
  set_text(value_el?.querySelector('strong'), format_number(normalized_value));
  if (!value_el?.matches?.('button[data-inspect-status]')) return;

  const can_inspect = card.hasAttribute('data-loaded') && normalized_value > 0;
  const collection_name = card.querySelector('h4')?.textContent || 'this collection';
  const presentation = INSPECTION_PRESENTATION[key] || INSPECTION_PRESENTATION.skipped;
  value_el.disabled = !can_inspect;
  value_el.toggleAttribute('data-has-items', can_inspect);
  value_el.setAttribute(
    'aria-label',
    can_inspect
      ? `Inspect ${format_number(normalized_value)} ${presentation.noun} in ${collection_name}`
      : `No ${presentation.noun} in ${collection_name}`,
  );
  value_el.title = can_inspect
    ? presentation.description
    : ''
  ;
  if (!can_inspect) {
    value_el.removeAttribute('data-selected');
    value_el.setAttribute('aria-expanded', 'false');
  }
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
 * @param {object} env
 * @returns {Promise<object>}
 */
async function get_vector_file_stats(env) {
  try {
    return await collect_vector_file_stats(env, {
      collection_keys: COLLECTION_KEYS,
    });
  } catch (error) {
    console.error('[env_stats] Failed to read vector files', error);
    return {
      files: [],
      errors: [{
        collection_key: 'vector_files',
        message: error?.message || 'Vector files unavailable',
      }],
      total_bytes: 0,
      unknown_size_count: 0,
    };
  }
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
