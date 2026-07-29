import { Modal } from 'obsidian';
import {
  get_embeddings_file_info,
  has_current_embedding,
  yield_to_main_thread,
} from '../../utils/embedding_diagnostics.js';

const DEFAULT_COLLECTION_KEYS = [
  'smart_sources',
  'smart_blocks',
];
const DEFAULT_YIELD_AFTER_MS = 10;
const YIELD_CHECK_INTERVAL = 64;

/**
 * Open environment stats.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_show_stats() {
  const app = this.main?.app || this.obsidian_app;
  if (!app) return false;

  const modal = new EnvStatsModal(app, this);
  modal.open();
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title: 'Show stats',
    icon: 'chart-pie',
    order: 20,
  },
};

class EnvStatsModal extends Modal {
  constructor(app, env) {
    super(app);
    this.env = env;
  }

  onOpen() {
    this.titleEl.setText('Smart Environment');
    this.modalEl?.classList?.add('smart-env-stats-modal');
    this.render();
  }

  onClose() {
    this.modalEl?.classList?.remove('smart-env-stats-modal');
    this.contentEl.empty();
  }

  async render() {
    this.contentEl.empty();
    const loading_el = this.contentEl.createEl('p', {
      cls: 'smart-env-stats-modal__loading',
      text: 'Opening stats...',
    });
    loading_el.setAttribute('aria-live', 'polite');

    try {
      const component = await this.env.smart_components.render_component(
        'env_stats',
        this.env,
      );
      this.contentEl.empty();
      if (component) {
        this.contentEl.appendChild(component);
        return;
      }
      this.contentEl.createEl('p', { text: 'Failed to load stats.' });
    } catch (error) {
      console.error('[env_stats] Failed to render stats modal', error);
      this.contentEl.empty();
      this.contentEl.createEl('p', {
        text: 'Failed to load stats. See the developer console for details.',
      });
    }
  }
}

/**
 * Collect environment-level source and block embedding statistics without
 * resolving vector views for every item.
 *
 * @param {object} env
 * @param {object} [params={}]
 * @param {string[]} [params.collection_keys]
 * @param {(progress: object) => void} [params.on_progress]
 * @param {(stats: object) => void} [params.on_collection]
 * @param {() => boolean} [params.is_cancelled]
 * @param {number} [params.yield_after_ms]
 * @returns {Promise<object>}
 */
export async function collect_environment_stats(env, params = {}) {
  const {
    collection_keys = DEFAULT_COLLECTION_KEYS,
    on_progress,
    on_collection,
    is_cancelled,
    yield_after_ms = DEFAULT_YIELD_AFTER_MS,
  } = params;
  const started_at = now_ms();
  const collections = [];

  for (const collection_key of collection_keys) {
    if (is_cancelled?.()) break;

    const collection = env?.[collection_key];
    const state = env?.collections?.[collection_key] || 'not loaded';
    const stats = await collect_collection_stats(collection, {
      collection_key,
      state,
      is_cancelled,
      yield_after_ms,
      on_progress: (collection_stats) => {
        on_progress?.({
          collection_key,
          collection_stats,
        });
      },
    });

    collections.push(stats);
    on_collection?.(stats);
  }

  return {
    collections,
    totals: aggregate_collection_stats(collections),
    scan_time_ms: Math.max(0, Math.round(now_ms() - started_at)),
    cancelled: Boolean(is_cancelled?.()),
  };
}

/**
 * Collect embedding coverage for one collection in one item pass.
 *
 * The previous stats implementation materialized Object.values() repeatedly
 * and resolved item.vec multiple times. Resolving item.vec creates typed-array views and
 * may migrate embedding metadata. This collector reads the persisted current
 * embedding ref directly and evaluates should_embed once per item.
 *
 * @param {object|null|undefined} collection
 * @param {object} [params={}]
 * @param {string} [params.collection_key]
 * @param {string} [params.state]
 * @param {(stats: object) => void} [params.on_progress]
 * @param {() => boolean} [params.is_cancelled]
 * @param {number} [params.yield_after_ms]
 * @returns {Promise<object>}
 */
export async function collect_collection_stats(collection, params = {}) {
  const {
    collection_key = collection?.collection_key || '',
    state = collection?.env?.collections?.[collection_key] || 'not loaded',
    on_progress,
    is_cancelled,
    yield_after_ms = DEFAULT_YIELD_AFTER_MS,
  } = params;
  const started_at = now_ms();
  const items = collection?.items || {};
  const item_keys = Object.keys(items);
  const stats = create_collection_stats({
    collection_key,
    state,
    total_items: item_keys.length,
    load_time_ms: collection?.load_time_ms,
  });

  if (!collection || !collection.items || state !== 'loaded') {
    return finalize_collection_stats(stats, started_at);
  }

  const embeddings = collection.embeddings;
  const file_info = get_embeddings_file_info(embeddings);
  let yielded_at = started_at;

  for (let item_i = 0; item_i < item_keys.length; item_i += 1) {
    if (is_cancelled?.()) {
      stats.cancelled = true;
      break;
    }

    const item = items[item_keys[item_i]];
    if (!item) continue;

    const should_embed = get_should_embed(item);
    const vectorized = has_current_embedding(item, embeddings, file_info);

    stats.scanned_items += 1;
    if (should_embed) stats.should_embed += 1;
    else stats.should_not_embed += 1;

    if (vectorized) stats.vectorized += 1;
    if (should_embed && vectorized) stats.embedded += 1;
    if (should_embed && !vectorized) stats.missing_embed += 1;
    if (!should_embed && vectorized) stats.extraneous_embed += 1;
    if (item._queue_embed) stats.queued += 1;

    if ((item_i + 1) % YIELD_CHECK_INTERVAL !== 0) continue;
    const current_time = now_ms();
    if (current_time - yielded_at < yield_after_ms) continue;

    on_progress?.(finalize_collection_stats({ ...stats }, started_at, false));
    await yield_to_main_thread();
    yielded_at = now_ms();
  }

  return finalize_collection_stats(stats, started_at);
}

/**
 * Collect item-level diagnostics for an inspectable collection statistic.
 *
 * Skipped includes every item that is not currently eligible. Unexpected is
 * the skipped subset that still has a current vector. Records are collected
 * only on demand so the primary stats scan stays lightweight.
 *
 * @param {object|null|undefined} collection
 * @param {object} [params={}]
 * @param {string} [params.collection_key]
 * @param {'skipped'|'unexpected'} [params.status]
 * @param {(progress: object) => void} [params.on_progress]
 * @param {() => boolean} [params.is_cancelled]
 * @param {number} [params.yield_after_ms]
 * @returns {Promise<object>}
 */
export async function collect_collection_inspection_records(collection, params = {}) {
  const {
    collection_key = collection?.collection_key || '',
    status = 'skipped',
    on_progress,
    is_cancelled,
    yield_after_ms = DEFAULT_YIELD_AFTER_MS,
  } = params;
  if (status !== 'skipped' && status !== 'unexpected') {
    throw new TypeError(`Unsupported collection inspection status: ${status}`);
  }

  const started_at = now_ms();
  const items = collection?.items || {};
  const item_keys = Object.keys(items);
  const embeddings = collection?.embeddings;
  const file_info = get_embeddings_file_info(embeddings);
  const records = [];
  const reasons_by_key = new Map();
  const status_counts = {
    skipped: 0,
    unexpected: 0,
  };
  let scanned_items = 0;
  let yielded_at = started_at;

  for (let item_i = 0; item_i < item_keys.length; item_i += 1) {
    if (is_cancelled?.()) break;

    const item = items[item_keys[item_i]];
    if (!item) continue;

    const should_embed = get_should_embed(item);
    scanned_items += 1;
    if (!should_embed) {
      const vectorized = has_current_embedding(item, embeddings, file_info);
      if (status === 'skipped' || vectorized) {
        const record = create_collection_inspection_record(item, {
          collection,
          collection_key,
          vectorized,
        });
        records.push(record);
        status_counts[record.status_key] += 1;
        const reason = reasons_by_key.get(record.reason_key) || {
          key: record.reason_key,
          label: record.reason_label,
          count: 0,
        };
        reason.count += 1;
        reasons_by_key.set(record.reason_key, reason);
      }
    }

    if ((item_i + 1) % YIELD_CHECK_INTERVAL !== 0) continue;
    const current_time = now_ms();
    if (current_time - yielded_at < yield_after_ms) continue;

    on_progress?.({
      collection_key,
      status,
      scanned_items,
      total_items: item_keys.length,
      matched_items: records.length,
    });
    await yield_to_main_thread();
    yielded_at = now_ms();
  }

  records.sort(compare_inspection_records);

  return {
    collection_key,
    status,
    total_items: item_keys.length,
    scanned_items,
    records,
    status_counts,
    reasons: [...reasons_by_key.values()].sort((a, b) => (
      b.count - a.count
      || a.label.localeCompare(b.label)
    )),
    scan_time_ms: Math.max(0, Math.round(now_ms() - started_at)),
    cancelled: Boolean(is_cancelled?.()),
  };
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compare_inspection_records(a, b) {
  return String(a?.source_key || '').localeCompare(String(b?.source_key || ''))
    || Number(a?.line_start || 0) - Number(b?.line_start || 0)
    || String(a?.key || '').localeCompare(String(b?.key || ''))
  ;
}

/**
 * @param {object} item
 * @param {object} params
 * @returns {object}
 */
function create_collection_inspection_record(item, params = {}) {
  const {
    collection,
    collection_key = '',
    vectorized = false,
  } = params;
  const key = get_item_key(item);
  const item_type = collection_key === 'smart_blocks' ? 'block' : 'source';
  const size = get_item_size(item);
  const min_chars = get_min_chars(item, collection, collection_key);
  const reason = get_collection_skip_reason(item, {
    collection_key,
    item_type,
    min_chars,
    size,
  });
  const line_start = item_type === 'block'
    ? get_line_number(item, 'line_start')
    : null
  ;
  const line_end = item_type === 'block'
    ? Math.max(line_start || 1, get_line_number(item, 'line_end') || line_start || 1)
    : null
  ;
  const file_type = get_string_value(item, 'file_type');
  const source_key = item_type === 'block'
    ? get_string_value(item, 'source_key') || key.split('#')[0]
    : key
  ;
  const search_text = [
    key,
    source_key,
    file_type,
    reason.label,
    reason.detail,
    vectorized ? 'unexpected vector' : 'skipped',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  ;

  return {
    item,
    key,
    source_key,
    item_type,
    status_key: vectorized ? 'unexpected' : 'skipped',
    vectorized,
    size,
    min_chars,
    line_start,
    line_end,
    file_type,
    reason_key: reason.key,
    reason_label: reason.label,
    reason_detail: reason.detail,
    search_text,
  };
}

/**
 * @param {object} item
 * @param {object} params
 * @returns {object}
 */
function get_collection_skip_reason(item, params = {}) {
  const {
    collection_key = '',
    item_type = 'source',
    min_chars = 0,
    size = null,
  } = params;

  if (item_type === 'block' || collection_key === 'smart_blocks') {
    if (Number.isFinite(size) && size < min_chars) {
      return {
        key: 'below_minimum_size',
        label: 'Below minimum size',
        detail: `Recorded size is below the ${min_chars}-character block minimum.`,
      };
    }
    return {
      key: 'block_coverage_plan',
      label: 'Not selected by block plan',
      detail: 'The current non-overlapping block coverage plan did not select this block.',
    };
  }

  if (get_boolean_value(item, 'is_gone')) {
    return {
      key: 'source_unavailable',
      label: 'Source file unavailable',
      detail: 'The indexed source no longer resolves to a file.',
    };
  }

  if (get_adapter_should_embed(item) === false) {
    const file_type = get_string_value(item, 'file_type');
    const display_file_type = file_type.startsWith('.') ? file_type : `.${file_type}`;
    return {
      key: 'source_type_excluded',
      label: 'Source type excluded',
      detail: file_type
        ? `The active adapter does not embed ${display_file_type} sources.`
        : 'The active source adapter does not embed this source type.',
    };
  }

  if (Number.isFinite(size) && size <= min_chars) {
    return {
      key: 'below_minimum_size',
      label: 'Below minimum size',
      detail: `Recorded size does not exceed the ${min_chars}-character source minimum.`,
    };
  }

  return {
    key: 'current_policy',
    label: 'Excluded by current policy',
    detail: 'The item is not eligible under the current embedding policy.',
  };
}

/**
 * @param {object} item
 * @returns {string}
 */
function get_item_key(item) {
  const key = get_string_value(item, 'key') || get_string_value(item, 'path');
  return key || 'Unknown item';
}

/**
 * @param {object} item
 * @returns {number|null}
 */
function get_item_size(item) {
  const candidates = [];
  try {
    candidates.push(item?.size);
  } catch {
    // Continue to persisted fallbacks.
  }
  try {
    candidates.push(item?.data?.size);
    candidates.push(item?.data?.last_read?.size);
    candidates.push(item?.file?.stat?.size);
  } catch {
    // A diagnostic row can omit size when item data is unavailable.
  }

  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/**
 * @param {object} item
 * @param {object} collection
 * @param {string} collection_key
 * @returns {number}
 */
function get_min_chars(item, collection, collection_key) {
  let item_min_chars;
  let collection_min_chars;
  try {
    item_min_chars = item?.settings?.min_chars;
  } catch {
    item_min_chars = undefined;
  }
  try {
    collection_min_chars = collection?.settings?.min_chars;
  } catch {
    collection_min_chars = undefined;
  }

  const configured_min_chars = item_min_chars ?? collection_min_chars;
  const normalized_min_chars = Number(
    collection_key === 'smart_sources'
      ? configured_min_chars || 300
      : configured_min_chars ?? 0
  );
  return Number.isFinite(normalized_min_chars)
    ? Math.max(0, normalized_min_chars)
    : collection_key === 'smart_sources' ? 300 : 0
  ;
}

/**
 * @param {object} item
 * @returns {boolean|undefined}
 */
function get_adapter_should_embed(item) {
  try {
    const value = item?.source_adapter?.should_embed;
    return typeof value === 'boolean' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {object} item
 * @param {string} key
 * @returns {string}
 */
function get_string_value(item, key) {
  try {
    const value = item?.[key];
    return value == null ? '' : String(value);
  } catch {
    return '';
  }
}

/**
 * @param {object} item
 * @param {string} key
 * @returns {boolean}
 */
function get_boolean_value(item, key) {
  try {
    return item?.[key] === true;
  } catch {
    return false;
  }
}

/**
 * @param {object} item
 * @param {string} key
 * @returns {number|null}
 */
function get_line_number(item, key) {
  try {
    const raw_value = item?.[key];
    if (raw_value == null || raw_value === '') return null;
    const value = Number(raw_value);
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null;
  } catch {
    return null;
  }
}

/**
 * Sum collection statistics for the environment summary.
 *
 * @param {object[]} collections
 * @returns {object}
 */
export function aggregate_collection_stats(collections = []) {
  const totals = {
    total_items: 0,
    scanned_items: 0,
    should_embed: 0,
    should_not_embed: 0,
    vectorized: 0,
    embedded: 0,
    missing_embed: 0,
    extraneous_embed: 0,
    queued: 0,
  };

  collections.forEach((stats) => {
    Object.keys(totals).forEach((key) => {
      totals[key] += Number(stats?.[key] || 0);
    });
  });

  totals.coverage_percent = totals.should_embed
    ? Math.round((totals.embedded / totals.should_embed) * 100)
    : null
  ;
  return totals;
}

/**
 * @param {object} params
 * @returns {object}
 */
function create_collection_stats(params = {}) {
  return {
    collection_key: params.collection_key || '',
    state: params.state || 'not loaded',
    total_items: Number(params.total_items || 0),
    scanned_items: 0,
    should_embed: 0,
    should_not_embed: 0,
    vectorized: 0,
    embedded: 0,
    missing_embed: 0,
    extraneous_embed: 0,
    queued: 0,
    coverage_percent: null,
    load_time_ms: Number(params.load_time_ms || 0),
    scan_time_ms: 0,
    cancelled: false,
  };
}

/**
 * @param {object} stats
 * @param {number} started_at
 * @param {boolean} [round_time=true]
 * @returns {object}
 */
function finalize_collection_stats(stats, started_at, round_time = true) {
  stats.coverage_percent = stats.should_embed
    ? Math.round((stats.embedded / stats.should_embed) * 100)
    : null
  ;
  const elapsed = Math.max(0, now_ms() - started_at);
  stats.scan_time_ms = round_time ? Math.round(elapsed) : elapsed;
  return stats;
}

/**
 * @param {object} item
 * @returns {boolean}
 */
function get_should_embed(item) {
  try {
    return Boolean(item.should_embed);
  } catch (error) {
    console.warn('[env_stats] Failed to evaluate should_embed', item?.key, error);
    return false;
  }
}

/**
 * @returns {number}
 */
function now_ms() {
  return globalThis.performance?.now?.() || Date.now();
}
