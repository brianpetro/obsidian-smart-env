import styles from './notification_feed.css';
import {
  all_levels_filter_key,
  are_all_levels_active,
  create_all_levels_set,
  entries_to_clipboard_text,
  format_level_label,
  get_entry_event_key,
  get_entry_level,
  get_entry_payload_text,
  get_entry_timestamp,
  get_entry_title,
  get_filtered_entries,
  get_level_counts,
  get_next_active_levels,
  get_next_visible_count,
  get_visible_count,
  get_visible_entries,
  is_canonical_notification_entry,
  notification_levels,
  should_show_load_more,
  to_time_ago,
} from '../utils/notifications_feed_utils.js';

function build_html() {
  return `<div class="smart-env-notifications">
    <div class="smart-env-notifications__toolbar">
      <div class="smart-env-notifications__summary" aria-live="polite"></div>
      <div class="smart-env-notifications__actions">
        <button class="smart-env-btn smart-env-btn--ghost copy-all-notifications-btn" type="button" title="Copy all filtered notifications to clipboard">Copy All</button>
      </div>
    </div>

    <div class="smart-env-notifications-filter-controls" aria-label="Notification level filters"></div>

    <div class="smart-env-notifications-feed" role="list"></div>

    <div class="smart-env-notifications__footer">
      <button class="smart-env-btn smart-env-btn--primary load-more-notifications-btn" type="button">Load more</button>
    </div>
  </div>`;
}

export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  await post_process.call(this, env, container, params);
  return container;
}

async function post_process(env, container, params = {}) {
  const {
    live_updates = false,
    auto_mark_seen = false,
    state = {},
  } = params;
  const feed_container = container.querySelector('.smart-env-notifications-feed');
  const copy_btn = container.querySelector('.copy-all-notifications-btn');
  const load_more_btn = container.querySelector('.load-more-notifications-btn');
  const filter_controls = container.querySelector('.smart-env-notifications-filter-controls');
  const summary_el = container.querySelector('.smart-env-notifications__summary');
  const smart_env = this;
  const expanded_entry_keys = state.expanded_entry_keys instanceof Set
    ? state.expanded_entry_keys
    : new Set()
  ;

  this.empty(feed_container);

  const active_levels = state.active_levels instanceof Set
    ? state.active_levels
    : create_all_levels_set()
  ;
  let visible_count = typeof state.visible_count === 'number'
    ? state.visible_count
    : null
  ;
  let filtered_count = typeof state.filtered_count === 'number'
    ? state.filtered_count
    : null
  ;

  state.active_levels = active_levels;
  state.expanded_entry_keys = expanded_entry_keys;

  const get_entries = () => {
    const session_entries = Array.isArray(env?.event_logs?.session_events)
      ? [...env.event_logs.session_events]
      : []
    ;
    return session_entries.filter((entry) => Boolean(get_entry_level(entry)));
  };

  const should_refresh_for_event = (event_key, event = {}) => {
    if (event_key === 'event_logs:mute_changed') return true;
    if (event_key === 'notifications:seen') return false;
    if (event_key === 'notifications:seen_all') return false;
    return Boolean(get_entry_level({ event_key, event }));
  };

  const capture_expanded_entry_keys = () => {
    expanded_entry_keys.clear();
    feed_container.querySelectorAll('details.smart-env-notification[open]').forEach((details_el) => {
      const entry_key = details_el.dataset.entryKey;
      if (!entry_key) return;
      expanded_entry_keys.add(entry_key);
    });
  };

  const set_active_levels = (next_active_levels) => {
    active_levels.clear();
    next_active_levels.forEach((level) => active_levels.add(level));
  };

  const maybe_mark_entries_seen = () => {
    if (!auto_mark_seen) return;
    env?.event_logs?.mark_all_notification_entries_seen?.();
  };

  const render_filters = (entries) => {
    render_filter_controls(filter_controls, {
      active_levels,
      level_counts: get_level_counts(entries),
      on_change: handle_filters_changed,
      on_select_all: () => {
        set_active_levels(create_all_levels_set());
      },
      on_select_level: (level) => {
        set_active_levels(get_next_active_levels(active_levels, { level }));
      },
    });
  };

  const render_entries = (entries) => {
    smart_env.empty(feed_container);

    const filtered_entries = get_filtered_entries(entries, { active_levels });
    const previous_filtered_count = typeof filtered_count === 'number'
      ? filtered_count
      : filtered_entries.length
    ;

    if (typeof visible_count !== 'number') {
      visible_count = get_visible_count(filtered_entries.length);
    } else if (visible_count >= previous_filtered_count) {
      visible_count = filtered_entries.length;
    } else {
      visible_count = Math.min(visible_count, filtered_entries.length);
    }

    filtered_count = filtered_entries.length;
    state.visible_count = visible_count;
    state.filtered_count = filtered_count;

    const shown_count = Math.min(visible_count, filtered_entries.length);

    update_summary(summary_el, {
      total_count: entries.length,
      filtered_count: filtered_entries.length,
      visible_count: shown_count,
    });

    set_btn_disabled(copy_btn, filtered_entries.length === 0);

    if (filtered_entries.length === 0) {
      render_empty_state(feed_container, {
        title: 'No notifications match your filters.',
        detail: 'Try enabling more levels.',
        action_text: 'Reset filters',
        on_action: reset_filters,
      });
      if (load_more_btn) load_more_btn.style.display = 'none';
      return;
    }

    get_visible_entries(filtered_entries, { limit: visible_count }).forEach((entry) => {
      append_entry(feed_container, entry, {
        env,
        expanded_entry_keys,
        on_entry_toggle: handle_entry_toggle,
        on_toggle_mute: handle_toggle_mute,
      });
    });

    update_load_more_button(load_more_btn, {
      entries_length: filtered_entries.length,
      visible_count,
    });
  };

  const render_feed = (opts = {}) => {
    const {
      preserve_expanded = false,
      reset_visible_count = false,
    } = opts;
    if (preserve_expanded) capture_expanded_entry_keys();

    const entries = get_entries();
    if (reset_visible_count) {
      const filtered_entries = get_filtered_entries(entries, { active_levels });
      visible_count = get_visible_count(filtered_entries.length);
      state.visible_count = visible_count;
      state.filtered_count = filtered_entries.length;
    }

    if (!entries.length) {
      smart_env.empty(feed_container);
      render_empty_state(feed_container, {
        title: 'No Smart Env notifications yet.',
        detail: 'When Smart Env emits levelled events, they will appear here.',
      });
      set_btn_disabled(copy_btn, true);
      if (load_more_btn) load_more_btn.style.display = 'none';
      update_summary(summary_el, { total_count: 0, filtered_count: 0, visible_count: 0 });
      maybe_mark_entries_seen();
      return;
    }

    render_filters(entries);
    render_entries(entries);
    maybe_mark_entries_seen();
  };

  const handle_filters_changed = () => {
    render_feed({ preserve_expanded: true, reset_visible_count: true });
  };

  const handle_toggle_mute = (entry) => {
    const event_key = entry?.event_key;
    if (!event_key || typeof env?.event_logs?.toggle_event_key_muted !== 'function') return;
    if (!is_canonical_notification_entry(entry)) return;
    env.event_logs.toggle_event_key_muted(event_key);
    render_feed({ preserve_expanded: true });
  };

  const handle_entry_toggle = (entry_key, is_open) => {
    if (is_open) {
      expanded_entry_keys.add(entry_key);
      return;
    }
    expanded_entry_keys.delete(entry_key);
  };

  const reset_filters = () => {
    set_active_levels(create_all_levels_set());
    render_feed({ preserve_expanded: true, reset_visible_count: true });
  };

  render_feed({ reset_visible_count: true });

  if (copy_btn) {
    copy_btn.addEventListener('click', async () => {
      if (copy_btn.disabled) return;

      const filtered_entries = get_filtered_entries(get_entries(), { active_levels });
      const newest_first = get_visible_entries(filtered_entries, { limit: filtered_entries.length });
      const all_text = entries_to_clipboard_text(newest_first);
      const copied = await write_text_to_clipboard(all_text);

      set_btn_copied_state(copy_btn, {
        idle_text: 'Copy All',
        copied_text: copied ? 'Copied' : 'Copy failed',
      });
    });
  }

  if (load_more_btn) {
    load_more_btn.addEventListener('click', () => {
      const filtered_entries = get_filtered_entries(get_entries(), { active_levels });
      visible_count = get_next_visible_count(filtered_entries.length, {
        current_count: visible_count,
      });
      state.visible_count = visible_count;
      render_feed({ preserve_expanded: true });
    });
  }

  if (live_updates && typeof env?.events?.on === 'function') {
    let debounce_timeout = null;
    const live_update_off = env.events.on('*', (event, event_key) => {
      if (!should_refresh_for_event(event_key, event)) return;
      if (debounce_timeout) clearTimeout(debounce_timeout);
      debounce_timeout = setTimeout(() => {
        debounce_timeout = null;
        render_feed({ preserve_expanded: true });
      }, 100);
    });

    this.attach_disposer(container, [
      live_update_off,
      () => {
        if (!debounce_timeout) return;
        clearTimeout(debounce_timeout);
        debounce_timeout = null;
      },
    ]);
  }
}

/**
 * @param {HTMLElement|null} container
 * @param {object} [params={}]
 * @param {Set<string>} [params.active_levels]
 * @param {Record<string, number>} [params.level_counts]
 * @param {Function} [params.on_change]
 * @param {Function} [params.on_select_all]
 * @param {Function} [params.on_select_level]
 */
function render_filter_controls(container, params = {}) {
  if (!container) return;

  const {
    active_levels = new Set(),
    level_counts = {},
    on_change = () => {},
    on_select_all = () => {},
    on_select_level = () => {},
  } = params;
  container.replaceChildren();

  const all_is_active = are_all_levels_active(active_levels);
  const total_count = Object.values(level_counts).reduce((acc, count) => acc + (count || 0), 0);

  append_filter_button(container, {
    level: all_levels_filter_key,
    label_text: 'All',
    count_total: total_count,
    is_active: all_is_active,
    modifier_class: 'smart-env-notifications-filter--all',
    on_click: () => {
      if (all_is_active) return;
      on_select_all();
      on_change();
    },
  });

  notification_levels.forEach((level) => {
    append_filter_button(container, {
      level,
      label_text: format_level_label(level),
      count_total: typeof level_counts[level] === 'number' ? level_counts[level] : 0,
      is_active: !all_is_active && active_levels.has(level),
      on_click: () => {
        on_select_level(level);
        on_change();
      },
    });
  });
}

/**
 * @param {HTMLElement} container
 * @param {object} params
 * @param {string} params.level
 * @param {string} params.label_text
 * @param {number} params.count_total
 * @param {boolean} params.is_active
 * @param {Function} params.on_click
 * @param {string} [params.modifier_class='']
 */
function append_filter_button(container, params) {
  const {
    level,
    label_text,
    count_total,
    is_active,
    on_click,
    modifier_class = '',
  } = params;

  const button = container.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = `smart-env-notifications-filter${modifier_class ? ` ${modifier_class}` : ''}`;
  button.dataset.level = level;
  button.setAttribute('aria-pressed', String(Boolean(is_active)));
  if (is_active) button.classList.add('is-active');
  button.addEventListener('click', on_click);

  const content = container.ownerDocument.createElement('span');
  content.className = 'smart-env-notifications-filter__content';

  const dot = container.ownerDocument.createElement('span');
  dot.className = 'smart-env-notifications-filter__dot';
  dot.setAttribute('aria-hidden', 'true');

  const text = container.ownerDocument.createElement('span');
  text.className = 'smart-env-notifications-filter__label';
  text.textContent = label_text;

  const count = container.ownerDocument.createElement('span');
  count.className = 'smart-env-notifications-filter__count';
  count.textContent = count_total > 0 ? String(count_total) : '';
  if (count_total <= 0) count.classList.add('is-zero');

  content.appendChild(dot);
  content.appendChild(text);
  content.appendChild(count);

  button.appendChild(content);
  container.appendChild(button);
}

/**
 * @param {HTMLButtonElement|null} button
 * @param {object} [params={}]
 * @param {number} [params.entries_length]
 * @param {number} [params.visible_count]
 */
function update_load_more_button(button, params = {}) {
  if (!button) return;

  const { entries_length = 0, visible_count = 0 } = params;
  const is_visible = should_show_load_more(entries_length, visible_count);

  button.style.display = is_visible ? 'block' : 'none';

  if (is_visible) {
    const remaining_count = entries_length - visible_count;
    const next_step = Math.min(100, remaining_count);
    button.textContent = `Load ${next_step} more`;
  }
}

function append_entry(feed_container, entry, params = {}) {
  const {
    env = null,
    expanded_entry_keys = new Set(),
    on_entry_toggle = () => {},
    on_toggle_mute = () => {},
  } = params;
  const level = get_entry_level(entry);
  if (!level) return;

  const title = get_entry_title(entry);
  const timestamp = get_entry_timestamp(entry);
  const collection_key = entry?.event?.collection_key ?? '';
  const event_key = get_entry_event_key(entry) || 'event';
  const payload_text = get_entry_payload_text(entry);
  const is_canonical = is_canonical_notification_entry(entry);
  const is_muted = is_canonical && Boolean(env?.event_logs?.is_event_key_muted?.(event_key));
  const entry_row_key = get_entry_row_key(entry);

  const has_payload = payload_text.trim().length > 0;
  const row = has_payload
    ? feed_container.ownerDocument.createElement('details')
    : feed_container.ownerDocument.createElement('div')
  ;

  row.className = 'smart-env-notification';
  row.dataset.entryKey = entry_row_key;
  row.dataset.level = level;
  row.setAttribute('role', 'listitem');
  if (is_muted) row.dataset.muted = 'true';
  if (has_payload && expanded_entry_keys.has(entry_row_key)) row.open = true;

  const summary = has_payload
    ? feed_container.ownerDocument.createElement('summary')
    : feed_container.ownerDocument.createElement('div')
  ;
  summary.className = 'smart-env-notification__summary';

  const accent = feed_container.ownerDocument.createElement('span');
  accent.className = 'smart-env-notification__accent';
  accent.setAttribute('aria-hidden', 'true');

  const body = feed_container.ownerDocument.createElement('div');
  body.className = 'smart-env-notification__summary-body';

  const top = feed_container.ownerDocument.createElement('div');
  top.className = 'smart-env-notification__summary-top';

  const event_el = feed_container.ownerDocument.createElement('div');
  event_el.className = 'smart-env-notification__event-key';
  event_el.textContent = title;

  const time_el = feed_container.ownerDocument.createElement('div');
  time_el.className = 'smart-env-notification__time';
  time_el.textContent = to_time_ago(timestamp);
  try {
    time_el.title = new Date(timestamp).toLocaleString();
  } catch (_err) {
    /* no-op */
  }

  top.appendChild(event_el);
  top.appendChild(time_el);

  const bottom = feed_container.ownerDocument.createElement('div');
  bottom.className = 'smart-env-notification__summary-bottom';

  if (collection_key) {
    const collection = feed_container.ownerDocument.createElement('span');
    collection.className = 'smart-env-notification__collection';
    collection.textContent = collection_key;
    bottom.appendChild(collection);
  }

  if (title !== event_key) {
    const event_key_tag = feed_container.ownerDocument.createElement('span');
    event_key_tag.className = 'smart-env-notification__collection';
    event_key_tag.textContent = event_key;
    bottom.appendChild(event_key_tag);
  }

  const level_tag = feed_container.ownerDocument.createElement('span');
  level_tag.className = 'smart-env-notification__level';
  level_tag.textContent = format_level_label(level);
  bottom.appendChild(level_tag);

  if (is_muted) {
    const muted_tag = feed_container.ownerDocument.createElement('span');
    muted_tag.className = 'smart-env-notification__muted';
    muted_tag.textContent = 'Muted';
    bottom.appendChild(muted_tag);
  }

  if (is_canonical) {
    const mute_btn = feed_container.ownerDocument.createElement('button');
    mute_btn.className = 'smart-env-btn smart-env-btn--ghost smart-env-notification__mute';
    mute_btn.type = 'button';
    mute_btn.textContent = is_muted ? 'Unmute' : 'Mute';
    mute_btn.setAttribute(
      'aria-label',
      is_muted ? 'Allow native notices for this event key' : 'Mute native notices for this event key',
    );
    mute_btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      on_toggle_mute(entry);
    });
    bottom.appendChild(mute_btn);
  } else {
    const feed_only_tag = feed_container.ownerDocument.createElement('span');
    feed_only_tag.className = 'smart-env-notification__feed-only';
    feed_only_tag.textContent = 'Feed only';
    bottom.appendChild(feed_only_tag);
  }

  body.appendChild(top);
  body.appendChild(bottom);

  summary.appendChild(accent);
  summary.appendChild(body);

  if (has_payload) {
    const chevron = feed_container.ownerDocument.createElement('span');
    chevron.className = 'smart-env-notification__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    summary.appendChild(chevron);
  }

  row.appendChild(summary);

  if (has_payload) {
    const message = feed_container.ownerDocument.createElement('pre');
    message.className = 'smart-env-notification__message';
    message.textContent = payload_text;
    row.appendChild(message);
    row.addEventListener('toggle', () => {
      on_entry_toggle(entry_row_key, row.open === true);
    });
  }

  feed_container.appendChild(row);
}

function update_summary(summary_el, params = {}) {
  if (!summary_el) return;

  const {
    total_count = 0,
    filtered_count = 0,
    visible_count = 0,
  } = params;

  if (total_count <= 0) {
    summary_el.textContent = '';
    return;
  }

  const shown = Math.min(visible_count, filtered_count);
  let text = `${shown} of ${filtered_count} shown`;
  if (filtered_count !== total_count) {
    text += ` (${total_count} total)`;
  }
  summary_el.textContent = text;
}

/**
 * @param {HTMLElement} feed_container
 * @param {object} [params={}]
 * @param {string} [params.title]
 * @param {string} [params.detail]
 * @param {string} [params.action_text]
 * @param {Function|null} [params.on_action]
 */
function render_empty_state(feed_container, params = {}) {
  const {
    title = 'Nothing here yet.',
    detail = '',
    action_text = '',
    on_action = null,
  } = params;

  const wrap = feed_container.ownerDocument.createElement('div');
  wrap.className = 'smart-env-notifications-empty-state';

  const heading = feed_container.ownerDocument.createElement('div');
  heading.className = 'smart-env-notifications-empty-state__title';
  heading.textContent = title;
  wrap.appendChild(heading);

  if (detail) {
    const detail_el = feed_container.ownerDocument.createElement('div');
    detail_el.className = 'smart-env-notifications-empty-state__detail';
    detail_el.textContent = detail;
    wrap.appendChild(detail_el);
  }

  if (action_text && typeof on_action === 'function') {
    const button = feed_container.ownerDocument.createElement('button');
    button.className = 'smart-env-btn smart-env-btn--ghost';
    button.type = 'button';
    button.textContent = action_text;
    button.addEventListener('click', () => on_action());
    wrap.appendChild(button);
  }

  feed_container.appendChild(wrap);
}

function set_btn_disabled(btn, is_disabled) {
  if (!btn) return;
  btn.disabled = Boolean(is_disabled);
}

function set_btn_copied_state(btn, params = {}) {
  if (!btn) return;

  const {
    idle_text = 'Copy',
    copied_text = 'Copied',
  } = params;

  btn.textContent = copied_text;
  btn.classList.add('is-copied');

  setTimeout(() => {
    btn.textContent = idle_text;
    btn.classList.remove('is-copied');
  }, 1400);
}

async function write_text_to_clipboard(text = '') {
  if (!text) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_err) {
    /* fall through */
  }

  try {
    if (typeof window !== 'undefined' && typeof window.require === 'function') {
      const { clipboard } = window.require('electron');
      if (clipboard?.writeText) {
        clipboard.writeText(text);
        return true;
      }
    }
  } catch (_err) {
    /* fall through */
  }

  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(copied);
  } catch (_err) {
    return false;
  }
}

/**
 * @param {object} entry
 * @returns {string}
 */
function get_entry_row_key(entry) {
  return `${get_entry_event_key(entry)}:${get_entry_timestamp(entry)}`;
}
