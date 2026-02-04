import { Notice } from 'obsidian';
import {
  EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY,
  check_if_event_emitted,
  derive_events_checklist_groups,
} from './onboarding_events_data.js';
import {
  DEFAULT_IDLE_DELAY_MS,
  dequeue_event_key,
  enqueue_event_key,
  get_idle_delay_ms,
  is_valid_milestone_event,
  update_visibility_idle_state,
} from './onboarding_events_utils.js';

export { EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY, check_if_event_emitted, derive_events_checklist_groups };

const MILESTONE_IDLE_DELAY_MS = DEFAULT_IDLE_DELAY_MS;
const MILESTONE_NOTICE_DURATION_MS = 7000;
const MILESTONE_INPUT_EVENTS = [
  'keydown',
  'mousedown',
  'mousemove',
  'touchstart',
  'wheel',
];

export function register_first_of_event_notifications(env) {
  let notice_queue = [];
  let is_notice_active = false;
  let idle_timeout_id = null;
  let notice_timeout_id = null;
  let last_input_at = Date.now();
  let should_restart_idle = false;
  const teardown_callbacks = [];

  const register_dom_event = env?.main?.registerDomEvent?.bind(env.main);

  const add_dom_event = (target, event_name, handler) => {
    if (!target || typeof target.addEventListener !== 'function') return;
    if (register_dom_event) {
      register_dom_event(target, event_name, handler);
      return;
    }
    target.addEventListener(event_name, handler);
    teardown_callbacks.push(() => target.removeEventListener(event_name, handler));
  };

  const record_input = () => {
    last_input_at = Date.now();
    if (should_restart_idle) should_restart_idle = false;
    schedule_next_notice();
  };

  const register_input_listeners = () => {
    MILESTONE_INPUT_EVENTS.forEach((event_name) => {
      add_dom_event(window, event_name, record_input);
    });
  };

  const is_window_visible = () => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  };

  const handle_visibility_change = () => {
    const is_visible = is_window_visible();
    const visibility_state = update_visibility_idle_state({
      is_visible,
      should_restart_idle,
    });

    if (visibility_state.clear_idle_timeout) clear_idle_timeout();
    should_restart_idle = visibility_state.should_restart_idle;
    if (!is_visible) return;

    if (visibility_state.reset_last_input_at) {
      last_input_at = Date.now();
    }
    schedule_next_notice();
  };

  const register_visibility_listener = () => {
    add_dom_event(document, 'visibilitychange', handle_visibility_change);
  };

  const clear_idle_timeout = () => {
    if (!idle_timeout_id) return;
    clearTimeout(idle_timeout_id);
    idle_timeout_id = null;
  };

  const schedule_idle_timeout = (delay_ms) => {
    clear_idle_timeout();
    idle_timeout_id = setTimeout(() => {
      idle_timeout_id = null;
      schedule_next_notice();
    }, delay_ms);
  };

  const show_milestone_notice = (event_key) => {
    const item = EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY[event_key];
    if (!item) return;

    const frag = build_milestone_notice_fragment(event_key, env);
    new Notice(frag, MILESTONE_NOTICE_DURATION_MS);

    is_notice_active = true;
    if (notice_timeout_id) clearTimeout(notice_timeout_id);
    notice_timeout_id = setTimeout(() => {
      is_notice_active = false;
      notice_timeout_id = null;
      schedule_next_notice();
    }, MILESTONE_NOTICE_DURATION_MS);
  };

  const schedule_next_notice = () => {
    if (is_notice_active || notice_queue.length === 0) return;
    if (!is_window_visible()) {
      should_restart_idle = true;
      clear_idle_timeout();
      return;
    }

    const idle_delay_ms = get_idle_delay_ms({
      last_input_at,
      idle_delay_ms: MILESTONE_IDLE_DELAY_MS,
    });
    if (idle_delay_ms > 0) {
      schedule_idle_timeout(idle_delay_ms);
      return;
    }

    const result = dequeue_event_key(notice_queue);
    notice_queue = result.queue;
    if (!result.event_key) return;
    show_milestone_notice(result.event_key);
  };

  register_input_listeners();
  register_visibility_listener();

  const handle_first_event = (data) => {
    const event_key = data?.first_of_event_key;
    if (!is_valid_milestone_event(event_key, { items_by_event_key: EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY })) return;

    notice_queue = enqueue_event_key(notice_queue, { event_key });
    schedule_next_notice();
  };

  env?.events?.on?.('event_log:first', handle_first_event);

  return () => {
    teardown_callbacks.forEach((teardown) => teardown());
    clear_idle_timeout();
    if (notice_timeout_id) {
      clearTimeout(notice_timeout_id);
      notice_timeout_id = null;
    }
    if (env?.events?.off) {
      env.events.off('event_log:first', handle_first_event);
    } else if (env?.events?.removeListener) {
      env.events.removeListener('event_log:first', handle_first_event);
    }
  };
}

/**
 * @param {string} event_key
 * @param {import('../smart_env.js').SmartEnv} env
 * @returns {DocumentFragment}
 */
function build_milestone_notice_fragment(event_key, env) {
  const frag = document.createDocumentFragment();
  const msg = 'You achieved a new Smart Milestone 🎉';
  const msg_el = document.createElement('p');
  msg_el.textContent = msg;
  frag.appendChild(msg_el);

  const milestone_el = document.createElement('p');
  milestone_el.textContent = `✅ ${EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY[event_key].milestone}`;
  milestone_el.style.color = 'var(--color-green)';
  milestone_el.style.fontStyle = 'italic';
  frag.appendChild(milestone_el);

  const btn = document.createElement('button');
  btn.textContent = 'View milestones';
  btn.addEventListener('click', () => {
    env?.open_milestones_modal?.();
  });
  frag.appendChild(btn);

  return frag;
}
