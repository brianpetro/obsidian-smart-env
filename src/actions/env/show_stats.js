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
