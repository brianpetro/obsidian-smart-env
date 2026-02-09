import styles from './notification_feed.css';
function build_html() {
  return `<div>
    <div class="smart-env-notifications-controls">
      <button class="copy-all-notifications-btn">Copy All Notifications</button>
    </div>
    <div class="smart-env-notifications-filter-controls"></div>
    <div class="smart-env-notifications-feed"></div>
    <button class="load-more-notifications-btn">Load More</button>
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
  const smart_env = this;
  this.empty(feed_container);

  const entries = Array.isArray(env.event_logs.session_events) ? [...env.event_logs.session_events] : [];
  if (!entries.length) {
    const empty = feed_container.ownerDocument.createElement('p');
    empty.className = 'smart-env-notifications-empty';
    empty.textContent = 'No Smart Env notifications yet.';
    feed_container.appendChild(empty);
    if (load_more_btn) {
      load_more_btn.style.display = 'none';
    }
    return;
  }

  const active_levels = new Set(notification_levels);
  let visible_count = get_visible_count(entries.length, { page_size: default_page_size });

  const render_entries = () => {
    smart_env.empty(feed_container);
    const filtered_entries = get_filtered_entries(entries, { active_levels });
    get_visible_entries(filtered_entries, { limit: visible_count }).forEach((entry) => {
      append_entry(feed_container, entry);
    });
    update_load_more_button(load_more_btn, {
      entries_length: filtered_entries.length,
      visible_count,
    });
  };

  render_filter_controls(filter_controls, {
    active_levels,
    on_change: () => {
      const filtered_entries = get_filtered_entries(entries, { active_levels });
      visible_count = get_visible_count(filtered_entries.length, { page_size: default_page_size });
      render_entries();
    },
  });

  render_entries();

  if (copy_btn) {
    copy_btn.addEventListener('click', () => {
      const all_text = feed_container.textContent;
      navigator.clipboard.writeText(all_text).then(() => {
        copy_btn.textContent = 'Copied!';
        setTimeout(() => {
          copy_btn.textContent = 'Copy All Notifications';
        }, 2000);
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
 * @param {Function} params.on_change
 */
function render_filter_controls(container, params = {}) {
  if (!container) return;
  const { active_levels = new Set(), on_change = () => {} } = params;
  container.replaceChildren();
  notification_levels.forEach((level) => {
    const label = container.ownerDocument.createElement('label');
    label.className = 'smart-env-notifications-filter';

    const input = container.ownerDocument.createElement('input');
    input.type = 'checkbox';
    input.checked = active_levels.has(level);
    input.addEventListener('change', () => {
      if (input.checked) {
        active_levels.add(level);
      } else {
        active_levels.delete(level);
      }
      on_change();
    });

    const text = container.ownerDocument.createElement('span');
    text.textContent = level;

    label.appendChild(input);
    label.appendChild(text);
    container.appendChild(label);
  });
}

/**
 * @param {HTMLButtonElement} button
 * @param {object} params
 * @param {number} [params.entries_length]
 * @param {number} [params.visible_count]
 */
function update_load_more_button(button, params = {}) {
  if (!button) return;
  const { entries_length = 0, visible_count = 0 } = params;
  const is_visible = should_show_load_more(entries_length, visible_count);
  button.style.display = is_visible ? 'inline-block' : 'none';
  if (is_visible) {
    const remaining_count = entries_length - visible_count;
    const next_step = Math.min(load_more_step, remaining_count);
    button.textContent = `Load ${next_step} more`;
  }
}

function append_entry(feed_container, entry) {
  const row = feed_container.ownerDocument.createElement('div');
  row.className = 'smart-env-notification';
  row.dataset.level = get_entry_level(entry);
  feed_container.appendChild(row);

  const meta = feed_container.ownerDocument.createElement('div');
  meta.className = 'smart-env-notification__meta';
  const timestamp = typeof entry.event.at === 'number' ? entry.event.at : Date.now();
  meta.textContent = `${entry.event.collection_key ? entry.event.collection_key + ' - ' : ''}${entry.event_key} - ${to_time_ago(timestamp)}\n`;
  row.appendChild(meta);

  const event_payload_content = Object.entries(entry.event)
    .filter(([k]) => !['at', 'collection_key'].includes(k))
    .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`) // IMPORTANT NOTE: two prefix spaces for indentation
    .join('\n');

  if (event_payload_content.trim().length) {
    row.style.cursor = 'pointer';
    const message = feed_container.ownerDocument.createElement('pre');
    message.className = 'smart-env-notification__message';
    message.textContent = event_payload_content;
    message.textContent += '\n\n'; // IMPORTANT NOTE: trailing newline for spacing in copy to clipboard
    message.style.display = 'none';
    row.appendChild(message);
    row.addEventListener('click', () => {
      message.style.display = message.style.display === 'none' ? 'block' : 'none';
    });
  } else {
    meta.textContent += '\n';; // IMPORTANT NOTE: trailing newline for spacing in copy to clipboard
  }
}

function to_time_ago(ms) {
  const now_ms = Date.now();
  const seconds = Math.floor((now_ms - ms) / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}
