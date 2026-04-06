import styles from './notification_feed.css';
import {
  all_levels_filter_key,
  are_all_levels_active,
  create_all_levels_set,
  debug_levels_filter_key,
  entries_to_clipboard_text,
  format_level_label,
  get_entry_event_key,
  get_entry_level,
  get_entry_payload_text,
  get_entry_summary_action,
  get_entry_timestamp,
  get_entry_title,
  get_filtered_entries,
  get_level_counts,
  get_next_active_levels,
  get_next_visible_count,
  get_visible_count,
  get_visible_entries,
  queue_live_update_entries,
  is_canonical_notification_entry,
  is_debug_entry,
  load_more_step,
  notification_levels,
  should_show_load_more,
  to_time_ago,
} from '../utils/notifications_feed_utils.js';
import { dispatch_notice_action } from '../utils/notice_action_dispatch.js';

const feed_excluded_event_keys = new Set([
  'collection:save_started',
  'collection:save_completed',
  'notifications:seen',
  'notifications:seen_all',
  'event_log:first',
]);

function build_html() {
  return `<div class="smart-env-notifications">
    <div class="smart-env-notifications__sticky">
      <div class="smart-env-notifications__toolbar">
        <div class="smart-env-notifications-filter-controls" aria-label="Event level filters"></div>
        <div class="smart-env-notifications__meta">
          <div class="smart-env-notifications__summary" aria-live="polite"></div>
          <div class="smart-env-notifications__actions">
            <button class="smart-env-btn smart-env-btn--ghost copy-all-notifications-btn" type="button" title="Copy all filtered events to clipboard">Copy All</button>
          </div>
        </div>
      </div>
    </div>

    <div class="smart-env-notifications-live-updates"></div>
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
  const live_updates_el = container.querySelector('.smart-env-notifications-live-updates');
  const smart_env = this;
  const expanded_entry_keys = state.expanded_entry_keys instanceof Set
    ? state.expanded_entry_keys
    : new Set()
  ;
  let target_entry_key = typeof state?.target_entry_key === 'string'
    ? state.target_entry_key.trim()
    : ''
  ;
  let has_revealed_target_entry = false;

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
  let pending_live_entries = Array.isArray(state.pending_live_entries)
    ? [...state.pending_live_entries]
    : []
  ;
  let rendered_entries_cache = [];

  if (target_entry_key) {
    expanded_entry_keys.add(target_entry_key);
  }

  state.active_levels = active_levels;
  state.expanded_entry_keys = expanded_entry_keys;
  state.pending_live_entries = pending_live_entries;
  state.target_entry_key = target_entry_key;

  const get_entries = () => {
    const session_entries = Array.isArray(env?.event_logs?.session_events)
      ? [...env.event_logs.session_events]
      : []
    ;
    return session_entries;
  };

  const should_refresh_for_event = (event_key) => {
    if (event_key === 'event_logs:mute_changed') return true;
    if (feed_excluded_event_keys.has(event_key)) return false;
    return true;
  };

  const capture_expanded_entry_keys = () => {
    expanded_entry_keys.clear();
    feed_container.querySelectorAll('details.smart-env-notification[open]').forEach((details_el) => {
      const entry_key = details_el.dataset.entryKey;
      if (!entry_key) return;
      expanded_entry_keys.add(entry_key);
    });
    if (target_entry_key) {
      expanded_entry_keys.add(target_entry_key);
    }
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
      total_count: entries.length,
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

    const target_visible_count = get_required_visible_count_for_entry(filtered_entries, target_entry_key);
    if (typeof target_visible_count === 'number' && target_visible_count > visible_count) {
      visible_count = target_visible_count;
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
        title: 'No events match your filters.',
        detail: 'Try enabling more levels or switch back to All.',
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

    if (!has_revealed_target_entry && target_entry_key) {
      has_revealed_target_entry = reveal_target_entry(feed_container, target_entry_key);
      if (has_revealed_target_entry) {
        state.target_entry_key = '';
        target_entry_key = '';
      }
    }
  };

  const render_feed = (opts = {}) => {
    const {
      preserve_expanded = false,
      reset_visible_count = false,
    } = opts;
    if (preserve_expanded) capture_expanded_entry_keys();

    const entries = get_entries();
    rendered_entries_cache = entries;
    if (reset_visible_count) {
      const filtered_entries = get_filtered_entries(entries, { active_levels });
      visible_count = get_visible_count(filtered_entries.length);
      state.visible_count = visible_count;
      state.filtered_count = filtered_entries.length;
    }

    if (!entries.length) {
      smart_env.empty(feed_container);
      filter_controls?.replaceChildren?.();
      render_empty_state(feed_container, {
        title: 'No Smart Env events yet.',
        detail: 'When Smart Env emits events, they will appear here.',
      });
      set_btn_disabled(copy_btn, true);
      if (load_more_btn) load_more_btn.style.display = 'none';
      update_summary(summary_el, { total_count: 0, filtered_count: 0, visible_count: 0 });
      render_live_updates_action(live_updates_el, {
        pending_count: pending_live_entries.length,
        on_click: handle_show_live_updates,
      });
      maybe_mark_entries_seen();
      return;
    }

    render_filters(entries);
    render_entries(entries);
    render_live_updates_action(live_updates_el, {
      pending_count: pending_live_entries.length,
      on_click: handle_show_live_updates,
    });
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


  const handle_show_live_updates = () => {
    if (pending_live_entries.length === 0) return;
    pending_live_entries = [];
    state.pending_live_entries = pending_live_entries;
    render_feed({ preserve_expanded: true });
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
    const live_update_off = env.events.on('*', (_event, event_key) => {
      if (!should_refresh_for_event(event_key)) return;
      if (debounce_timeout) clearTimeout(debounce_timeout);
      debounce_timeout = setTimeout(() => {
        debounce_timeout = null;

        const next_entries = get_entries();

        pending_live_entries = queue_live_update_entries(pending_live_entries, next_entries, {
          existing_entries: rendered_entries_cache,
        });
        state.pending_live_entries = pending_live_entries;

        if (pending_live_entries.length > 0) {
          render_live_updates_action(live_updates_el, {
            pending_count: pending_live_entries.length,
            on_click: handle_show_live_updates,
          });
          return;
        }

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
 * @param {number} [params.total_count]
 * @param {Record<string, number>} [params.level_counts]
 * @param {Function} [params.on_change]
 * @param {Function} [params.on_select_all]
 * @param {Function} [params.on_select_level]
 */
function render_filter_controls(container, params = {}) {
  if (!container) return;

  const {
    active_levels = new Set(),
    total_count = 0,
    level_counts = {},
    on_change = () => {},
    on_select_all = () => {},
    on_select_level = () => {},
  } = params;
  container.replaceChildren();

  const all_is_active = are_all_levels_active(active_levels);

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

  append_filter_button(container, {
    level: debug_levels_filter_key,
    label_text: 'Debug',
    count_total: typeof level_counts[debug_levels_filter_key] === 'number'
      ? level_counts[debug_levels_filter_key]
      : 0,
    is_active: !all_is_active && active_levels.has(debug_levels_filter_key),
    on_click: () => {
      on_select_level(debug_levels_filter_key);
      on_change();
    },
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
  count.textContent = count_total > 0 ? count_total.toLocaleString() : '';
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
    const next_step = Math.min(load_more_step, remaining_count);
    button.textContent = `Load ${next_step.toLocaleString()} more`;
  }
}



/**
 * @param {HTMLElement|null} container
 * @param {object} [params={}]
 * @param {number} [params.pending_count]
 * @param {Function} [params.on_click]
 */
function render_live_updates_action(container, params = {}) {
  if (!container) return;

  const {
    pending_count = 0,
    on_click = () => {},
  } = params;

  container.replaceChildren();

  if (pending_count <= 0) return;

  const button = container.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'smart-env-btn smart-env-btn--ghost smart-env-notifications-live-updates__btn';
  button.textContent = `Show ${pending_count.toLocaleString()} new event${pending_count === 1 ? '' : 's'}`;
  button.addEventListener('click', on_click);
  container.appendChild(button);
}

function append_entry(feed_container, entry, params = {}) {
  const {
    env = null,
    expanded_entry_keys = new Set(),
    on_entry_toggle = () => {},
    on_toggle_mute = () => {},
  } = params;
  const level = get_entry_level(entry);
  const is_debug = is_debug_entry(entry);
  const title = get_entry_title(entry);
  const timestamp = get_entry_timestamp(entry);
  const collection_key = entry?.event?.collection_key ?? '';
  const event_key = get_entry_event_key(entry) || 'event';
  const payload_text = get_entry_payload_text(entry);
  const summary_action = get_entry_summary_action(entry);
  const is_canonical = is_canonical_notification_entry(entry);
  const is_muted = is_canonical && Boolean(env?.event_logs?.is_event_key_muted?.(event_key));
  const is_feed_only = Boolean(level) && !is_canonical;
  const entry_row_key = get_entry_row_key(entry);
  const total_count = get_event_key_total_count(env, event_key);
  const row_level = level || (is_debug ? debug_levels_filter_key : 'event');

  const row = feed_container.ownerDocument.createElement('details');
  row.className = 'smart-env-notification';
  row.dataset.entryKey = entry_row_key;
  row.dataset.level = row_level;
  row.setAttribute('role', 'listitem');
  if (is_muted) row.dataset.muted = 'true';
  if (expanded_entry_keys.has(entry_row_key)) row.open = true;

  const summary = feed_container.ownerDocument.createElement('summary');
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
  time_el.title = format_timestamp(timestamp);

  top.appendChild(event_el);
  if (summary_action) {
    const cta_btn = feed_container.ownerDocument.createElement('button');
    cta_btn.className = 'smart-env-btn smart-env-btn--ghost smart-env-notification__summary-action';
    cta_btn.type = 'button';
    cta_btn.textContent = summary_action.btn_text;
    cta_btn.setAttribute('aria-label', summary_action.btn_text);
    cta_btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dispatch_notice_action(env, summary_action.btn_callback, {
        event_key,
        event: entry?.event,
        event_source: 'notifications_feed',
      });
    });
    top.appendChild(cta_btn);
  }
  top.appendChild(time_el);

  const bottom = feed_container.ownerDocument.createElement('div');
  bottom.className = 'smart-env-notification__summary-bottom';

  if (collection_key) {
    bottom.appendChild(create_tag(feed_container, 'smart-env-notification__collection', collection_key));
  }

  if (title !== event_key) {
    bottom.appendChild(create_tag(feed_container, 'smart-env-notification__collection', event_key));
  }

  bottom.appendChild(create_tag(
    feed_container,
    'smart-env-notification__level',
    level ? format_level_label(level) : (is_debug ? 'Debug' : 'Event'),
  ));

  if (is_feed_only) {
    bottom.appendChild(create_tag(feed_container, 'smart-env-notification__feed-only', 'Feed only'));
  }

  if (is_muted) {
    bottom.appendChild(create_tag(feed_container, 'smart-env-notification__muted', 'Muted'));
  }

  body.appendChild(top);
  body.appendChild(bottom);

  const chevron = feed_container.ownerDocument.createElement('span');
  chevron.className = 'smart-env-notification__chevron';
  chevron.setAttribute('aria-hidden', 'true');

  summary.appendChild(accent);
  summary.appendChild(body);
  summary.appendChild(chevron);

  const expanded = feed_container.ownerDocument.createElement('div');
  expanded.className = 'smart-env-notification__expanded';

  const meta = feed_container.ownerDocument.createElement('div');
  meta.className = 'smart-env-notification__expanded-meta';
  append_meta_row(feed_container, meta, 'Occurred', format_timestamp(timestamp));
  append_meta_row(feed_container, meta, 'Event key', event_key);
  if (collection_key) {
    append_meta_row(feed_container, meta, 'Collection', collection_key);
  }
  expanded.appendChild(meta);

  const actions = feed_container.ownerDocument.createElement('div');
  actions.className = 'smart-env-notification__expanded-actions';

  actions.appendChild(create_tag(
    feed_container,
    'smart-env-notification__event-count',
    `${Math.max(1, total_count).toLocaleString()} total`,
  ));

  if (is_canonical) {
    const mute_btn = feed_container.ownerDocument.createElement('button');
    mute_btn.className = 'smart-env-btn smart-env-btn--ghost smart-env-notification__mute';
    mute_btn.type = 'button';
    mute_btn.textContent = is_muted ? 'Unmute native notices' : 'Mute native notices';
    mute_btn.setAttribute(
      'aria-label',
      is_muted ? 'Allow native notices for this event key' : 'Mute native notices for this event key',
    );
    mute_btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      on_toggle_mute(entry);
    });
    actions.appendChild(mute_btn);
  } else if (is_feed_only) {
    actions.appendChild(create_tag(feed_container, 'smart-env-notification__feed-only', 'Display fallback only'));
  }

  expanded.appendChild(actions);

  if (payload_text.trim().length) {
    const message = feed_container.ownerDocument.createElement('pre');
    message.className = 'smart-env-notification__message';
    message.textContent = payload_text;
    expanded.appendChild(message);
  }

  row.appendChild(summary);
  row.appendChild(expanded);
  row.addEventListener('toggle', () => {
    on_entry_toggle(entry_row_key, row.open === true);
  });

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

  const shown_count = Math.min(visible_count, filtered_count);
  const shown_label = shown_count.toLocaleString();
  const filtered_label = filtered_count.toLocaleString();
  const total_label = total_count.toLocaleString();

  let text = shown_count === filtered_count
    ? `${shown_label} shown`
    : `${shown_label} of ${filtered_label} shown`
  ;

  if (filtered_count !== total_count) {
    text += ` (${total_label} total)`;
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

/**
 * @param {Array} entries
 * @param {string} target_entry_key
 * @returns {number|null}
 */
function get_required_visible_count_for_entry(entries = [], target_entry_key = '') {
  if (!Array.isArray(entries) || !target_entry_key) return null;
  const target_index = entries.findIndex((entry) => get_entry_row_key(entry) === target_entry_key);
  if (target_index === -1) return null;
  return entries.length - target_index;
}

/**
 * @param {HTMLElement} feed_container
 * @param {string} target_entry_key
 * @returns {boolean}
 */
function reveal_target_entry(feed_container, target_entry_key = '') {
  if (!feed_container || !target_entry_key) return false;
  const target_entry_el = Array.from(feed_container.querySelectorAll('.smart-env-notification'))
    .find((details_el) => details_el.dataset.entryKey === target_entry_key)
  ;
  if (!target_entry_el) return false;
  target_entry_el.open = true;
  target_entry_el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  return true;
}

/**
 * @param {object|null} env
 * @param {string} event_key
 * @returns {number}
 */
function get_event_key_total_count(env, event_key) {
  if (!event_key) return 0;
  return env?.event_logs?.get?.(event_key)?.data?.ct || 0;
}

/**
 * @param {HTMLElement} feed_container
 * @param {string} class_name
 * @param {string} text
 * @returns {HTMLElement}
 */
function create_tag(feed_container, class_name, text) {
  const el = feed_container.ownerDocument.createElement('span');
  el.className = class_name;
  el.textContent = text;
  return el;
}

/**
 * @param {HTMLElement} feed_container
 * @param {HTMLElement} container
 * @param {string} label
 * @param {string} value
 * @returns {void}
 */
function append_meta_row(feed_container, container, label, value) {
  const row = feed_container.ownerDocument.createElement('div');
  row.className = 'smart-env-notification__expanded-row';

  const label_el = feed_container.ownerDocument.createElement('span');
  label_el.className = 'smart-env-notification__expanded-label';
  label_el.textContent = label;

  const value_el = feed_container.ownerDocument.createElement('span');
  value_el.className = 'smart-env-notification__expanded-value';
  value_el.textContent = value;

  row.appendChild(label_el);
  row.appendChild(value_el);
  container.appendChild(row);
}

/**
 * @param {number} timestamp
 * @returns {string}
 */
function format_timestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch (_error) {
    return String(timestamp);
  }
}
