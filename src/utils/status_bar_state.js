import { get_next_notification_status } from 'smart-events/event_level_utils.js';

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
 * Resolve the highest unseen notification severity.
 * Info notifications still count but do not escalate severity.
 *
 * @param {Object} [event_logs]
 * @returns {'attention'|'warning'|'error'|null}
 */
export function get_notification_indicator_level(event_logs) {
  return get_unseen_notification_entries(event_logs)
    .reduce((current_status, entry) => {
      return get_next_notification_status(current_status, entry?.event_key, entry?.event);
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
  const indicator_level = get_notification_indicator_level(env?.event_logs);
  const import_progress = get_import_progress_state(env);
  const embed_progress = get_embed_progress_state(env);
  const embed_queue_count = get_reimport_queue_count(env);
  const version = env?.is_pro ? 'Pro' : env?.constructor?.version;

  let message = `Smart Env${version ? ` ${version}` : ''}`;
  let title = 'Smart Environment status';
  let click_action = 'context_menu';

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
  } else if (embed_progress?.active) {
    const progress = typeof embed_progress.progress === 'number' ? embed_progress.progress : 0;
    const total = typeof embed_progress.total === 'number' ? embed_progress.total : 0;

    if (embed_progress.paused) {
      message = `Embedding paused ${progress}/${total}`;
      title = 'Click to resume embedding.';
      click_action = 'resume_embed';
    } else {
      message = `Embedding ${progress}/${total}`;
      title = 'Click to pause embedding.';
      click_action = 'pause_embed';
    }
  } else if (env?.state !== 'loaded') {
    if (env?.state === 'loading') {
      message = 'Loading Smart Env…';
      title = 'Smart Environment is loading.';
      click_action = 'noop';
    }
  } else if (embed_queue_count > 0) {
    message = `Re-import (${embed_queue_count})`;
    title = 'Click to re-import queued sources.';
    click_action = 'run_reimport';
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
