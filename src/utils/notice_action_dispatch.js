/**
 * @param {unknown} value
 * @returns {string}
 */
function to_trimmed_string(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function is_plain_object(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
  ;
}

/**
 * @param {object} [params={}]
 * @returns {Record<string, unknown>}
 */
function get_source_event(params = {}) {
  if (is_plain_object(params.source_event)) return params.source_event;
  if (is_plain_object(params.event)) return params.event;
  return {};
}

/**
 * @param {object} [params={}]
 * @returns {string}
 */
function get_source_event_key(params = {}) {
  return to_trimmed_string(params.source_event_key)
    || to_trimmed_string(params.event_key)
  ;
}

/**
 * Dispatch an explicit event button payload from a source notice event.
 *
 * `btn_event_key` is the event-first CTA path. It must preserve
 * `btn_event_payload` at the top-level so modal/feed listeners can resolve the
 * intended item instead of receiving only generic callback metadata.
 *
 * @param {any} env
 * @param {object} [params={}]
 * @param {string} [params.event_source='native_notice_button']
 * @param {string} [params.source_event_key='']
 * @param {Record<string, unknown>} [params.source_event={}]
 * @returns {boolean|null} null when no btn_event_key is present
 */
function dispatch_btn_event_action(env, params = {}) {
  const {
    event_source = 'native_notice_button',
    source_event_key = '',
    source_event = {},
  } = params;
  const btn_event_key = to_trimmed_string(source_event?.btn_event_key);
  if (!btn_event_key) return null;
  if (typeof env?.events?.emit !== 'function') return false;

  const btn_event_payload = is_plain_object(source_event?.btn_event_payload)
    ? source_event.btn_event_payload
    : {}
  ;

  env.events.emit(btn_event_key, {
    ...btn_event_payload,
    event_source,
    source_event_key,
    source_event,
  });
  return true;
}

/**
 * Dispatch a JSON-safe notice callback key.
 *
 * Resolution order:
 * 1. Emit explicit `source_event.btn_event_key` with `btn_event_payload` when present.
 * 2. Execute a matching Obsidian command id when available.
 * 3. Otherwise emit the callback key as an env event.
 *
 * Callback dispatch is control flow, not a notification emission. The fallback
 * event must preserve the original payload shape so callback events never show
 * up as synthetic warning notifications in EventLogs.
 *
 * @param {any} env
 * @param {string} callback_key
 * @param {object} [params={}]
 * @param {string} [params.event_source='native_notice_button']
 * @param {string} [params.source_event_key='']
 * @param {Record<string, unknown>} [params.source_event={}]
 * @param {string} [params.event_key=''] Legacy alias for source_event_key.
 * @param {Record<string, unknown>} [params.event={}] Legacy alias for source_event.
 * @returns {boolean}
 */
export function dispatch_notice_action(env, callback_key, params = {}) {
  const event_source = to_trimmed_string(params.event_source) || 'native_notice_button';
  const source_event_key = get_source_event_key(params);
  const source_event = get_source_event(params);

  const btn_event_result = dispatch_btn_event_action(env, {
    event_source,
    source_event_key,
    source_event,
  });
  if (btn_event_result !== null) return btn_event_result;

  const next_callback_key = to_trimmed_string(callback_key);
  if (!next_callback_key) return false;

  const app_commands = env?.main?.app?.commands;
  if (app_commands?.commands?.[next_callback_key] && typeof app_commands.executeCommandById === 'function') {
    app_commands.executeCommandById(next_callback_key);
    return true;
  }

  if (typeof env?.events?.emit !== 'function') return false;

  env.events.emit(next_callback_key, {
    event_source,
    source_event_key,
    source_event,
  });
  return true;
}

