/**
 * @param {any} scope
 * @returns {any|null}
 */
export function get_notice_event_env(scope) {
  if (scope?.events?.emit) return scope;
  if (scope?.env?.events?.emit) return scope.env;
  return null;
}

/**
 * @param {object} [params={}]
 * @param {string} [params.level='info']
 * @param {string} [params.message='']
 * @param {string} [params.details='']
 * @param {string} [params.btn_text='']
 * @param {string} [params.btn_callback='']
 * @param {string} [params.link='']
 * @param {string} [params.event_source='']
 * @returns {Record<string, unknown>}
 */
export function build_notice_event_payload(params = {}) {
  const {
    level = 'info',
    message = '',
    details = '',
    btn_text = '',
    btn_callback = '',
    link = '',
    event_source = '',
  } = params;

  /** @type {Record<string, unknown>} */
  const payload = {
    level,
  };

  if (message) payload.message = message;
  if (details) payload.details = details;
  if (btn_text) payload.btn_text = btn_text;
  if (btn_callback) payload.btn_callback = btn_callback;
  if (link) payload.link = link;
  if (event_source) payload.event_source = event_source;

  return payload;
}

/**
 * @param {any} scope
 * @param {object} params
 * @param {string} params.event_key
 * @param {string} [params.level='info']
 * @param {string} [params.message='']
 * @param {string} [params.details='']
 * @param {string} [params.btn_text='']
 * @param {string} [params.btn_callback='']
 * @param {string} [params.link='']
 * @param {string} [params.event_source='']
 * @returns {boolean}
 */
export function emit_notice_event(scope, params) {
  const env = get_notice_event_env(scope);
  const event_key = typeof params?.event_key === 'string'
    ? params.event_key.trim()
    : ''
  ;
  if (!env?.events?.emit || !event_key) return false;

  const payload = build_notice_event_payload(params);
  env.events.emit(event_key, payload);
  return true;
}
