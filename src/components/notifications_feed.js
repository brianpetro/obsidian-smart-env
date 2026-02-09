import styles from './notification_feed.css';

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

const default_page_size = 100;
const load_more_step = 100;
const notification_levels = ['attention', 'error', 'warning', 'info'];

/**
 * @param {Array} entries
 * @param {object} params
 * @param {Set<string>} [params.active_levels]
 * @returns {Array}
 */
export function get_filtered_entries(entries, params = {}) {
  const { active_levels = new Set(notification_levels) } = params;
  if (!(active_levels instanceof Set) || active_levels.size === 0) return [];
  return entries.filter((entry) => active_levels.has(get_entry_level(entry)));
}

/**
 * @param {Array} entries
 * @param {object} params
 * @param {number} [params.limit]
 * @returns {Array}
 */
export function get_visible_entries(entries, params = {}) {
  const { limit = default_page_size } = params;
  return entries.slice(-limit).reverse();
}

/**
 * @param {number} entries_length
 * @param {object} params
 * @param {number} [params.page_size]
 * @returns {number}
 */
export function get_visible_count(entries_length, params = {}) {
  const { page_size = default_page_size } = params;
  return Math.min(entries_length, page_size);
}

/**
 * @param {number} entries_length
 * @param {object} params
 * @param {number} [params.current_count]
 * @param {number} [params.step_size]
 * @returns {number}
 */
export function get_next_visible_count(entries_length, params = {}) {
  const { current_count = 0, step_size = load_more_step } = params;
  return Math.min(entries_length, current_count + step_size);
}

/**
 * @param {number} entries_length
 * @param {number} visible_count
 * @returns {boolean}
 */
export function should_show_load_more(entries_length, visible_count) {
  return entries_length > visible_count;
}

/**
 * @param {object} entry
 * @param {string} [entry.event_key]
 * @returns {string}
 */
export function get_entry_level(entry) {
  const event_key = typeof entry?.event_key === 'string' ? entry.event_key : '';
  const [event_domain, event_type] = event_key.split(':');
  if (event_domain === 'notification' && event_type) {
    return event_type;
  }
  if (event_type === 'error') {
    return 'error';
  }
  return 'info';
}

export async function render(env, params = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  post_process.call(this, env, container, params);
  return frag;
}

async function post_process(env, container, params = {}) {
  const feed_container = container.querySelector('.smart-env-notifications-feed');
  const copy_btn = container.querySelector('.copy-all-notifications-btn');
  const load_more_btn = container.querySelector('.load-more-notifications-btn');
  const filter_controls = container.querySelector('.smart-env-notifications-filter-controls');
  const summary_el = container.querySelector('.smart-env-notifications__summary');
  const smart_env = this;

  this.empty(feed_container);

  const entries = Array.isArray(env.event_logs.session_events) ? [...env.event_logs.session_events] : [];
  if (!entries.length) {
    render_empty_state(feed_container, {
      title: 'No Smart Env notifications yet.',
      detail: 'When Smart Env emits notification events, they will appear here.',
    });
    set_btn_disabled(copy_btn, true);
    if (load_more_btn) load_more_btn.style.display = 'none';
    update_summary(summary_el, { total_count: 0, filtered_count: 0, visible_count: 0 });
    return;
  }

  const active_levels = new Set(notification_levels);
  const level_counts = get_level_counts(entries);
  let visible_count = get_visible_count(entries.length, { page_size: default_page_size });

  const reset_filters = () => {
    active_levels.clear();
    notification_levels.forEach((level) => active_levels.add(level));
    render_filter_controls(filter_controls, {
      active_levels,
      level_counts,
      on_change: handle_filters_changed,
    });
    const filtered_entries = get_filtered_entries(entries, { active_levels });
    visible_count = get_visible_count(filtered_entries.length, { page_size: default_page_size });
    render_entries();
  };

  const render_entries = () => {
    smart_env.empty(feed_container);

    const filtered_entries = get_filtered_entries(entries, { active_levels });
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
      append_entry(feed_container, entry);
    });

    update_load_more_button(load_more_btn, {
      entries_length: filtered_entries.length,
      visible_count,
    });
  };

  function handle_filters_changed() {
    const filtered_entries = get_filtered_entries(entries, { active_levels });
    visible_count = get_visible_count(filtered_entries.length, { page_size: default_page_size });
    render_entries();
  }

  render_filter_controls(filter_controls, {
    active_levels,
    level_counts,
    on_change: handle_filters_changed,
  });

  render_entries();

  if (copy_btn) {
    copy_btn.addEventListener('click', () => {
      if (copy_btn.disabled) return;

      const filtered_entries = get_filtered_entries(entries, { active_levels });
      const newest_first = get_visible_entries(filtered_entries, { limit: filtered_entries.length });
      const all_text = entries_to_clipboard_text(newest_first);

      navigator.clipboard.writeText(all_text).then(() => {
        set_btn_copied_state(copy_btn, { idle_text: 'Copy All', copied_text: 'Copied' });
      });
    });
  }

  if (load_more_btn) {
    load_more_btn.addEventListener('click', () => {
      const filtered_entries = get_filtered_entries(entries, { active_levels });
      visible_count = get_next_visible_count(filtered_entries.length, {
        current_count: visible_count,
        step_size: load_more_step,
      });
      render_entries();
    });
  }
}

/**
 * @param {HTMLElement|null} container
 * @param {object} params
 * @param {Set<string>} params.active_levels
 * @param {Record<string, number>} params.level_counts
 * @param {Function} params.on_change
 */
function render_filter_controls(container, params = {}) {
  if (!container) return;

  const { active_levels = new Set(), level_counts = {}, on_change = () => {} } = params;
  container.replaceChildren();

  notification_levels.forEach((level) => {
    const label = container.ownerDocument.createElement('label');
    label.className = 'smart-env-notifications-filter';
    label.dataset.level = level;

    const input = container.ownerDocument.createElement('input');
    input.type = 'checkbox';
    input.checked = active_levels.has(level);
    input.setAttribute('aria-label', `Toggle ${level} notifications`);
    input.addEventListener('change', () => {
      if (input.checked) {
        active_levels.add(level);
      } else {
        active_levels.delete(level);
      }
      on_change();
    });

    const content = container.ownerDocument.createElement('span');
    content.className = 'smart-env-notifications-filter__content';

    const dot = container.ownerDocument.createElement('span');
    dot.className = 'smart-env-notifications-filter__dot';
    dot.setAttribute('aria-hidden', 'true');

    const text = container.ownerDocument.createElement('span');
    text.className = 'smart-env-notifications-filter__label';
    text.textContent = format_level_label(level);

    const count = container.ownerDocument.createElement('span');
    count.className = 'smart-env-notifications-filter__count';
    const n = typeof level_counts[level] === 'number' ? level_counts[level] : 0;
    count.textContent = n > 0 ? String(n) : '';
    if (n <= 0) count.classList.add('is-zero');

    content.appendChild(dot);
    content.appendChild(text);
    content.appendChild(count);

    label.appendChild(input);
    label.appendChild(content);
    container.appendChild(label);
  });
}

/**
 * @param {HTMLButtonElement|null} button
 * @param {object} params
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
    button.textContent = `Load ${next_step} more`;
  }
}

function append_entry(feed_container, entry) {
  const level = get_entry_level(entry);
  const timestamp = get_entry_timestamp(entry);
  const collection_key = get_entry_collection_key(entry);
  const event_key = get_entry_event_key(entry) || 'event';
  const payload_text = get_entry_payload_text(entry);

  const has_payload = payload_text.trim().length > 0;
  const row = has_payload
    ? feed_container.ownerDocument.createElement('details')
    : feed_container.ownerDocument.createElement('div');

  row.className = 'smart-env-notification';
  row.dataset.level = level;
  row.setAttribute('role', 'listitem');

  const summary = has_payload
    ? feed_container.ownerDocument.createElement('summary')
    : feed_container.ownerDocument.createElement('div');

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
  event_el.textContent = event_key;

  const time_el = feed_container.ownerDocument.createElement('div');
  time_el.className = 'smart-env-notification__time';
  time_el.textContent = to_time_ago(timestamp);
  try {
    time_el.title = new Date(timestamp).toLocaleString();
  } catch (e) {
    // ignore
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

  const level_tag = feed_container.ownerDocument.createElement('span');
  level_tag.className = 'smart-env-notification__level';
  level_tag.textContent = format_level_label(level);
  bottom.appendChild(level_tag);

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
  }

  feed_container.appendChild(row);
}

function update_summary(summary_el, params = {}) {
  if (!summary_el) return;

  const { total_count = 0, filtered_count = 0, visible_count = 0 } = params;

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
 * @param {object} params
 * @param {string} params.title
 * @param {string} [params.detail]
 * @param {string} [params.action_text]
 * @param {Function} [params.on_action]
 */
function render_empty_state(feed_container, params = {}) {
  const { title = 'Nothing here yet.', detail = '', action_text = '', on_action = null } = params;

  const wrap = feed_container.ownerDocument.createElement('div');
  wrap.className = 'smart-env-notifications-empty-state';

  const heading = feed_container.ownerDocument.createElement('div');
  heading.className = 'smart-env-notifications-empty-state__title';
  heading.textContent = title;
  wrap.appendChild(heading);

  if (detail) {
    const p = feed_container.ownerDocument.createElement('div');
    p.className = 'smart-env-notifications-empty-state__detail';
    p.textContent = detail;
    wrap.appendChild(p);
  }

  if (action_text && typeof on_action === 'function') {
    const btn = feed_container.ownerDocument.createElement('button');
    btn.className = 'smart-env-btn smart-env-btn--ghost';
    btn.type = 'button';
    btn.textContent = action_text;
    btn.addEventListener('click', () => on_action());
    wrap.appendChild(btn);
  }

  feed_container.appendChild(wrap);
}

function set_btn_disabled(btn, is_disabled) {
  if (!btn) return;
  btn.disabled = Boolean(is_disabled);
}

function set_btn_copied_state(btn, params = {}) {
  if (!btn) return;

  const { idle_text = 'Copy', copied_text = 'Copied' } = params;

  btn.textContent = copied_text;
  btn.classList.add('is-copied');

  setTimeout(() => {
    btn.textContent = idle_text;
    btn.classList.remove('is-copied');
  }, 1400);
}

function format_level_label(level) {
  const s = typeof level === 'string' ? level : '';
  if (!s.length) return '';
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function get_level_counts(entries) {
  const counts = notification_levels.reduce((acc, level) => {
    acc[level] = 0;
    return acc;
  }, {});

  entries.forEach((entry) => {
    const level = get_entry_level(entry);
    if (counts[level] !== undefined) {
      counts[level] += 1;
    }
  });

  return counts;
}

function get_entry_timestamp(entry) {
  return typeof entry?.event?.at === 'number' ? entry.event.at : Date.now();
}

function get_entry_collection_key(entry) {
  return typeof entry?.event?.collection_key === 'string' ? entry.event.collection_key : '';
}

function get_entry_event_key(entry) {
  return typeof entry?.event_key === 'string' ? entry.event_key : '';
}

function get_entry_payload_text(entry) {
  const event_obj = entry?.event && typeof entry.event === 'object' ? entry.event : {};

  return Object.entries(event_obj)
    .filter(([k]) => !['at', 'collection_key'].includes(k))
    .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`) // IMPORTANT NOTE: two prefix spaces for indentation
    .join('\n');
}

function get_entry_meta_text(entry) {
  const collection_key = get_entry_collection_key(entry);
  const event_key = get_entry_event_key(entry) || 'event';
  const timestamp = get_entry_timestamp(entry);

  return `${collection_key ? collection_key + ' - ' : ''}${event_key} - ${to_time_ago(timestamp)}`;
}

function entry_to_clipboard_text(entry) {
  const meta = get_entry_meta_text(entry);
  const payload = get_entry_payload_text(entry);

  if (!payload.trim().length) {
    return `${meta}\n\n`;
  }

  return `${meta}\n${payload}\n\n`;
}

function entries_to_clipboard_text(entries = []) {
  return entries.map((entry) => entry_to_clipboard_text(entry)).join('');
}

function to_time_ago(ms) {
  const now_ms = Date.now();
  const seconds = Math.floor((now_ms - ms) / 1000);

  if (seconds < 60) return `${Math.max(0, seconds)}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
