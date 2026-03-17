/**
 * Dispatch a JSON-safe notice callback key.
 *
 * Resolution order:
 * 1. Execute a matching Obsidian command id when available.
 * 2. Otherwise emit the callback key as an env event.
 *
 * This keeps native notice buttons and component notice buttons aligned.
 *
 * @param {any} env
 * @param {string} callback_key
 * @param {object} [params={}]
 * @param {string} [params.event_source='native_notice_button']
 * @param {string} [params.source_event_key='']
 * @param {Record<string, unknown>} [params.source_event={}]
 * @returns {boolean}
 */
export function dispatch_notice_action(env, callback_key, params = {}) {
  const next_callback_key = typeof callback_key === 'string'
    ? callback_key.trim()
    : ''
  ;
  if (!next_callback_key) return false;

  const {
    event_source = 'native_notice_button',
    source_event_key = '',
    source_event = {},
  } = params;

  const app_commands = env?.main?.app?.commands;
  if (app_commands?.commands?.[next_callback_key] && typeof app_commands.executeCommandById === 'function') {
    app_commands.executeCommandById(next_callback_key);
    return true;
  }

  env?.events?.emit?.(next_callback_key, {
    level: 'warning',
    message: `No command found for callback key: ${next_callback_key}`,
    event_source,
    source_event_key,
    source_event,
  });
  return true;
}
