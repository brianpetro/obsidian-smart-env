import { get_event_level } from 'smart-events/event_level_utils.js';
import {
  get_native_notice_message,
  get_native_notice_timeout,
} from './event_logs_utils.js';

const indicator_level_rank = {
  info: 1,
  milestone: 2,
  attention: 3,
  warning: 4,
  error: 5,
};

/**
 * Return unseen canonical notification entries.
 *
 * @param {Object} [event_logs]
 * @param {Array<{unseen?: boolean}>} [event_logs.session_events]
 * @returns {Array}
 */
export function get_unseen_notification_entries(event_logs) {
  const session_events = event_logs?.session_events;
  if (!Array.isArray(session_events)) return [];
  return session_events.filter((entry) => entry?.unseen === true);
}

/**
 * Count unseen canonical notifications from event logs.
 *
 * @param {Object} [event_logs]
 * @returns {number}
 */
export function get_notification_event_count(event_logs) {
  return get_unseen_notification_entries(event_logs).length;
}

/**
 * Resolve the next display level for the status bar indicator.
 *
 * This preserves milestone and info as distinct display states while still
 * ranking error > warning > attention > milestone > info.
 *
 * @param {'milestone'|'attention'|'error'|'warning'|'info'|null} current_level
 * @param {string} [event_key='']
 * @param {Record<string, unknown>} [event={}]
 * @returns {'milestone'|'attention'|'error'|'warning'|'info'|null}
 */
export function get_next_indicator_level(current_level, event_key = '', event = {}) {
  const next_level = get_event_level(event_key, event);
  if (!next_level) return current_level ?? null;

  const current_rank = indicator_level_rank[current_level] || 0;
  const next_rank = indicator_level_rank[next_level] || 0;

  if (next_rank > current_rank) return next_level;
  return current_level ?? next_level;
}

/**
 * Resolve the highest unseen notification display level.
 *
 * @param {Object} [event_logs]
 * @returns {'milestone'|'attention'|'error'|'warning'|'info'|null}
 */
export function get_notification_indicator_level(event_logs) {
  return get_unseen_notification_entries(event_logs)
    .reduce((current_level, entry) => {
      return get_next_indicator_level(current_level, entry?.event_key, entry?.event);
    }, null)
  ;
}

/**
 * Return the first line of the native notice message.
 *
 * @param {string} event_key
 * @param {Record<string, unknown>} [event={}]
 * @returns {string}
 */
function get_status_bar_notice_line(event_key = '', event = {}) {
  const message = get_native_notice_message(event_key, event);
  return String(message || '')
    .split(/\r?\n/u)[0]
    .trim()
  ;
}

/**
 * Truncate a status bar notice preview to 20 chars plus ellipsis when needed.
 *
 * @param {string} value
 * @returns {string}
 */
function format_status_bar_notice_message(value = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= 20) return text;
  return `${text.slice(0, 20)}…`;
}

/**
 * Resolve the latest active muted-notice preview for the status bar.
 *
 * Canonical notification events that did not render a native notice still get a
 * short-lived status bar message using the same timeout window as the notice.
 *
 * @param {Object} [event_logs]
 * @returns {{ message: string, title: string }|null}
 */
function get_status_bar_notice_preview(event_logs) {
  const session_events = event_logs?.session_events;
  if (!Array.isArray(session_events) || session_events.length === 0) return null;

  for (let i = session_events.length - 1; i >= 0; i -= 1) {
    const entry = session_events[i];
    const event_key = typeof entry?.event_key === 'string' ? entry.event_key : '';
    const event = entry?.event && typeof entry.event === 'object' ? entry.event : {};

    if (!get_event_level(event_key, event)) continue;
    if (entry?.native_notice_shown === true) return null;

    const timeout_ms = get_native_notice_timeout(event_key, event);
    const expires_at = get_entry_timestamp(entry) + timeout_ms;
    if (Date.now() > expires_at) return null;

    const title = get_status_bar_notice_line(event_key, event);
    const message = format_status_bar_notice_message(title);
    if (!message) return null;

    return { message, title };
  }

  return null;
}

/**
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {object|null}
 */
export function get_import_progress_state(env) {
  return env?.smart_sources?.get_import_progress_state?.() || null;
}

/**
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {object|null}
 */
export function get_embed_progress_state(env) {
  return env?.smart_sources?.entities_vector_adapter?.get_progress_state?.() || null;
}

/**
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {number}
 */
export function get_reimport_queue_count(env) {
  return Object.keys(env?.smart_sources?.sources_re_import_queue || {}).length;
}

/**
 * @param {number|null} progress
 * @param {number|null} total
 * @returns {number|null}
 */
export function get_progress_pct(progress, total) {
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

/**
 * @param {string} collection_key
 * @returns {string}
 */
function format_collection_label(collection_key = '') {
  return collection_key
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
  ;
}

/**
 * Resolve collection-loading progress while Smart Environment is in its base loading phase.
 *
 * `env.collections` advances from `init` to `loaded` one collection at a time.
 * The first non-loaded collection is treated as the current collection being loaded.
 *
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {{
 *   total: number,
 *   loaded: number,
 *   pending: number,
 *   current_key: string,
 *   current_label: string,
 * }}
 */
function get_collection_loading_state(env) {
  const collection_entries = Object.entries(env?.collections || {})
    .filter(([collection_key]) => Boolean(collection_key))
  ;
  const total = collection_entries.length;
  const loaded = collection_entries.filter(([, state]) => state === 'loaded').length;
  const pending_entries = collection_entries.filter(([, state]) => state !== 'loaded');
  const current_key = pending_entries[0]?.[0] || '';

  return {
    total,
    loaded,
    pending: Math.max(0, total - loaded),
    current_key,
    current_label: current_key ? format_collection_label(current_key) : '',
  };
}

/**
 * Build the primary environment activity state shared by the status bar and
 * the status view item view.
 *
 * This keeps import, embedding, queued re-import, loading, and ready states
 * aligned across both surfaces so initial import progress renders the same way
 * everywhere.
 *
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {{
 *   kind: 'embed_active'|'embed_paused'|'importing'|'reimporting'|'loading'|'reimport_queued'|'ready'|'not_loaded',
 *   message: string,
 *   title: string,
 *   click_action: string,
 *   indicator_level: ('milestone'|'attention'|'error'|'warning'|'info'|null),
 *   progress_value: number|null,
 *   progress_total: number|null,
 *   progress_pct: number|null,
 *   view_title: string,
 *   view_status: string,
 *   view_summary: string,
 *   view_details: string[],
 *   view_actions: string[],
 * }}
 */
export function get_env_activity_state(env) {
  const import_progress = get_import_progress_state(env);
  const embed_progress = get_embed_progress_state(env);
  const reimport_queue_count = get_reimport_queue_count(env);
  // const version = `v${(env?.constructor?.version.split('.').slice(0, 2).join('.') || '')}`;
  const version = `v${(env?.constructor?.version || '')}`;
  const default_message = `${env?.is_pro ? 'Pro' : 'Smart'} ${version}`;

  if (import_progress?.active) {
    const progress = normalize_number(import_progress.progress);
    const total = normalize_number(import_progress.total);
    const stage = to_non_empty_string(import_progress.stage) || 'importing';
    const is_reimporting = stage === 'reimporting';

    return {
      kind: is_reimporting ? 'reimporting' : 'importing',
      message: `${is_reimporting ? 'Re-importing' : 'Importing'} ${progress}/${total}`,
      title: is_reimporting
        ? 'Smart Environment is re-importing queued sources.'
        : 'Smart Environment is importing sources.',
      click_action: 'noop',
      indicator_level: null,
      progress_value: progress,
      progress_total: total,
      progress_pct: get_progress_pct(progress, total),
      view_title: is_reimporting ? 'Re-importing sources' : 'Importing sources',
      view_status: `${progress}/${total}`,
      view_summary: is_reimporting
        ? 'Refreshing queued source changes before embeddings continue.'
        : 'Discovering and importing sources into Smart Environment.',
      view_details: [
        reimport_queue_count > 0
          ? `${reimport_queue_count} additional source${reimport_queue_count === 1 ? '' : 's'} queued.`
          : '',
        env?.state === 'loading'
          ? 'Smart Environment is still loading in the background.'
          : '',
      ].filter(Boolean),
      view_actions: [],
    };
  }

  if (embed_progress?.active) {
    const progress = normalize_number(embed_progress.progress);
    const total = normalize_number(embed_progress.total);
    const paused = Boolean(embed_progress.paused);
    const tokens_per_second = normalize_number(embed_progress.tokens_per_second);
    const model_name = to_non_empty_string(embed_progress.model_name);
    const reason = to_non_empty_string(embed_progress.reason);

    return {
      kind: paused ? 'embed_paused' : 'embed_active',
      message: `${paused ? 'Embedding paused' : 'Embedding'} ${progress}/${total}`,
      title: paused
        ? 'Click to resume embedding.'
        : 'Click to pause embedding.',
      click_action: paused ? 'resume_embed' : 'pause_embed',
      indicator_level: paused ? 'attention' : 'milestone',
      progress_value: progress,
      progress_total: total,
      progress_pct: get_progress_pct(progress, total),
      view_title: paused ? 'Embedding paused' : 'Embedding in progress',
      view_status: `${progress}/${total}`,
      view_summary: model_name
        ? `Using ${model_name} for embeddings.`
        : 'Generating embeddings for imported content.',
      view_details: [
        tokens_per_second > 0 ? `${tokens_per_second} tokens/sec` : '',
        reason,
        reimport_queue_count > 0
          ? `${reimport_queue_count} source${reimport_queue_count === 1 ? '' : 's'} still queued for re-import.`
          : '',
      ].filter(Boolean),
      view_actions: [paused ? 'resume_embed' : 'pause_embed'],
    };
  }

  if (env?.state === 'loading') {
    const collection_loading = get_collection_loading_state(env);
    const collection_progress_value = collection_loading.total > 0
      ? collection_loading.loaded
      : null
    ;
    const collection_progress_total = collection_loading.total > 0
      ? collection_loading.total
      : null
    ;
    const current_collection_label = collection_loading.current_label;
    const collection_status = collection_loading.total > 0
      ? `${collection_loading.loaded}/${collection_loading.total}`
      : 'In progress'
    ;

    return {
      kind: 'loading',
      message: current_collection_label
        ? `Loading ${current_collection_label}…`
        : 'Loading Smart Env…',
      title: current_collection_label
        ? `Smart Environment is loading ${current_collection_label}.`
        : 'Smart Environment is loading.',
      click_action: 'noop',
      indicator_level: null,
      progress_value: collection_progress_value,
      progress_total: collection_progress_total,
      progress_pct: get_progress_pct(collection_progress_value, collection_progress_total),
      view_title: 'Loading Smart Environment',
      view_status: current_collection_label
        ? `${current_collection_label} • ${collection_status}`
        : collection_status,
      view_summary: current_collection_label
        ? `Loading collection: ${current_collection_label}.`
        : 'Preparing collections, sources, and shared plugin state.',
      view_details: [
        collection_loading.total > 0
          ? `${collection_loading.loaded} of ${collection_loading.total} collection${collection_loading.total === 1 ? '' : 's'} loaded.`
          : '',
        collection_loading.pending > 0
          ? `${collection_loading.pending} collection${collection_loading.pending === 1 ? '' : 's'} remaining.`
          : '',
        reimport_queue_count > 0
          ? `${reimport_queue_count} source${reimport_queue_count === 1 ? '' : 's'} queued for re-import after load.`
          : '',
      ].filter(Boolean),
      view_actions: [],
    };
  }

  if (reimport_queue_count > 0) {
    return {
      kind: 'reimport_queued',
      message: `Re-import (${reimport_queue_count})`,
      title: 'Click to re-import queued sources.',
      click_action: 'run_reimport',
      indicator_level: 'attention',
      progress_value: null,
      progress_total: null,
      progress_pct: null,
      view_title: 'Queued re-import work',
      view_status: `${reimport_queue_count} queued`,
      view_summary: 'Run re-import to refresh changed sources and resume downstream embedding work.',
      view_details: [],
      view_actions: ['run_reimport'],
    };
  }

  if (env?.state === 'loaded') {
    return {
      kind: 'ready',
      message: default_message,
      title: 'Smart Environment status',
      click_action: 'context_menu',
      indicator_level: null,
      progress_value: null,
      progress_total: null,
      progress_pct: null,
      view_title: 'Smart Environment ready',
      view_status: 'Ready',
      view_summary: 'No active import or embedding work is running right now.',
      view_details: [],
      view_actions: ['open_notifications'],
    };
  }

  return {
    kind: 'not_loaded',
    message: default_message,
    title: 'Smart Environment status',
    click_action: 'context_menu',
    indicator_level: null,
    progress_value: null,
    progress_total: null,
    progress_pct: null,
    view_title: 'Smart Environment not loaded',
    view_status: 'Idle',
    view_summary: 'Load Smart Environment to enable Smart Plugins.',
    view_details: [],
    view_actions: ['load_env'],
  };
}

/**
 * Determine whether status surfaces should keep polling the shared activity
 * state. Polling is limited to active load/import/embed phases and the
 * deferred pre-load state so mobile status surfaces can transition into
 * loading without being reopened.
 *
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {boolean}
 */
export function should_poll_env_activity(env) {
  const activity_state = get_env_activity_state(env);
  if (get_status_bar_notice_preview(env?.event_logs)) return true;
  return [
    'embed_active',
    'embed_paused',
    'importing',
    'reimporting',
    'loading',
    'not_loaded',
  ].includes(activity_state.kind);
}

/**
 * Build status bar state based on the environment.
 *
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {{message: string, title: string, indicator_count: number, indicator_level: (string|null), embed_queue_count: number, click_action: string}}
 */
export function get_status_bar_state(env) {
  const notification_count = get_notification_event_count(env?.event_logs);
  const notification_indicator_level = get_notification_indicator_level(env?.event_logs);
  const activity_state = get_env_activity_state(env);
  const embed_queue_count = get_reimport_queue_count(env);
  const status_bar_notice_preview = get_status_bar_notice_preview(env?.event_logs);
  const can_show_notice_preview = Boolean(status_bar_notice_preview)
    && !['embed_active', 'embed_paused', 'importing', 'reimporting', 'loading'].includes(activity_state.kind)
  ;

  let title = activity_state.title;
  let indicator_level = activity_state.indicator_level;

  if (!indicator_level && notification_count > 0) {
    indicator_level = notification_indicator_level;
  }

  if (activity_state.kind === 'ready' && notification_count > 0) {
    title = `${notification_count} unseen notification${notification_count === 1 ? '' : 's'}`;
  }

  if (can_show_notice_preview && status_bar_notice_preview?.title) {
    title = status_bar_notice_preview.title;
  }

  return {
    message: can_show_notice_preview
      ? status_bar_notice_preview.message
      : activity_state.message,
    title,
    indicator_count: notification_count,
    indicator_level,
    embed_queue_count,
    click_action: activity_state.click_action,
  };
}

/**
 * @param {object} entry
 * @returns {number}
 */
export function get_entry_timestamp(entry) {
  if (typeof entry?.event?.at === 'number') return entry.event.at;
  if (typeof entry?.at === 'number') return entry.at;
  return Date.now();
}
