export const DEFAULT_IDLE_DELAY_MS = 3000;

/**
 * @param {object} params
 * @param {number} [params.last_input_at]
 * @param {number} [params.now]
 * @param {number} [params.idle_delay_ms]
 * @returns {number}
 */
export function get_idle_delay_ms(params = {}) {
  const {
    last_input_at = 0,
    now = Date.now(),
    idle_delay_ms = DEFAULT_IDLE_DELAY_MS,
  } = params;
  const elapsed_ms = Math.max(0, now - last_input_at);
  return Math.max(0, idle_delay_ms - elapsed_ms);
}

/**
 * @param {unknown} event_key
 * @param {object} params
 * @param {Record<string, unknown>} [params.items_by_event_key]
 * @returns {boolean}
 */
export function is_valid_milestone_event(event_key, params = {}) {
  const { items_by_event_key = {} } = params;
  if (typeof event_key !== 'string' || event_key.length === 0) return false;
  return Boolean(items_by_event_key && event_key in items_by_event_key);
}

/**
 * @param {string[]} queue
 * @param {object} params
 * @param {string} params.event_key
 * @returns {string[]}
 */
export function enqueue_event_key(queue, params = {}) {
  const { event_key } = params;
  const next_queue = Array.isArray(queue) ? queue.slice() : [];
  if (typeof event_key === 'string' && event_key.length > 0) {
    next_queue.push(event_key);
  }
  return next_queue;
}

/**
 * @param {string[]} queue
 * @returns {{ event_key: string | null, queue: string[] }}
 */
export function dequeue_event_key(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return { event_key: null, queue: [] };
  }
  const [event_key, ...rest] = queue;
  return { event_key, queue: rest };
}
