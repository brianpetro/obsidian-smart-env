import { get_event_level } from 'smart-events/event_level_utils.js';

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
 * Build status bar state based on the environment.
 *
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {{message: string, title: string, indicator_count: number, indicator_level: (string|null), embed_queue_count: number, click_action: string}}
 */
export function get_status_bar_state(env) {
  const notification_count = get_notification_event_count(env?.event_logs);
  const notification_indicator_level = get_notification_indicator_level(env?.event_logs);
  const import_progress = get_import_progress_state(env);
  const embed_progress = get_embed_progress_state(env);
  const embed_queue_count = get_reimport_queue_count(env);
  const version = env?.is_pro ? 'Pro' : env?.constructor?.version;

  let message = `Smart Env${version ? ` ${version}` : ''}`;
  let title = 'Smart Environment status';
  let click_action = 'context_menu';
  let indicator_level = notification_count > 0 ? notification_indicator_level : null;

  if (import_progress?.active) {
    const progress = typeof import_progress.progress === 'number' ? import_progress.progress : 0;
    const total = typeof import_progress.total === 'number' ? import_progress.total : 0;
    const stage = typeof import_progress.stage === 'string' ? import_progress.stage : 'importing';

    if (stage === 'reimporting') {
      message = `Re-importing ${progress}/${total}`;
      title = 'Smart Environment is re-importing queued sources.';
    } else {
      message = `Importing ${progress}/${total}`;
      title = 'Smart Environment is importing sources.';
    }

    click_action = 'noop';
    indicator_level = null;
  } else if (embed_progress?.active) {
    const progress = typeof embed_progress.progress === 'number' ? embed_progress.progress : 0;
    const total = typeof embed_progress.total === 'number' ? embed_progress.total : 0;

    if (embed_progress.paused) {
      message = `Embedding paused ${progress}/${total}`;
      title = 'Click to resume embedding.';
      click_action = 'resume_embed';
      indicator_level = 'attention';
    } else {
      message = `Embedding ${progress}/${total}`;
      title = 'Click to pause embedding.';
      click_action = 'pause_embed';
      indicator_level = 'milestone';
    }
  } else if (env?.state !== 'loaded') {
    if (env?.state === 'loading') {
      message = 'Loading Smart Env…';
      title = 'Smart Environment is loading.';
      click_action = 'noop';
      indicator_level = null;
    }
  } else if (embed_queue_count > 0) {
    message = `Re-import (${embed_queue_count})`;
    title = 'Click to re-import queued sources.';
    click_action = 'run_reimport';
    indicator_level = 'attention';
  } else if (notification_count > 0) {
    title = `${notification_count} unseen notification${notification_count === 1 ? '' : 's'}`;
  }

  return {
    message,
    title,
    indicator_count: notification_count,
    indicator_level,
    embed_queue_count,
    click_action,
  };
}
