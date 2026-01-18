/**
 * Count notification events from event logs.
 * @param {Object} [event_logs]
 * @param {Array<{event_key?: string}>} [event_logs.session_events]
 * @returns {number}
 */
export function get_notification_event_count(event_logs) {
  const session_events = event_logs?.session_events;
  if (!Array.isArray(session_events)) return 0;
  let count = 0;
  for (const entry of session_events) {
    const event_key = entry?.event_key;
    if (typeof event_key === 'string' && event_key.startsWith('notification:')) {
      count += 1;
    }
  }
  return count;
}

/**
 * Build status bar state based on the environment.
 * @param {import('../../smart_env.js').SmartEnv} env
 * @returns {{message: string, title: string, indicator_count: number, indicator_level: (string|null), embed_queue_count: number}}
 */
export function get_status_bar_state(env) {
  const embed_queue_count = Object.keys(env?.smart_sources?.sources_re_import_queue || {}).length;
  const notification_count = get_notification_event_count(env?.event_logs);
  const version = env?.is_pro ? 'Pro' : env?.constructor?.version;
  let message = `Smart Env${version ? ' ' + version : ''}`;
  let title = 'Smart Environment status';
  let indicator_level = null;

  if (embed_queue_count > 0) {
    message = `Embed now (${embed_queue_count})`;
    title = 'Click to re-import.';
    indicator_level = 'attention';
  } else if (notification_count > 0) {
    indicator_level = env?.event_logs?.notification_status || 'info';
  }

  return {
    message,
    title,
    indicator_count: notification_count,
    indicator_level,
    embed_queue_count,
  };
}
