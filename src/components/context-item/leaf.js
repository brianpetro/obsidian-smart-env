import { register_item_hover_popover } from '../../utils/register_item_hover_popover.js';
import { Platform } from 'obsidian';
import { escape_html } from 'smart-utils/escape_html.js';

/**
 * Format a context item score for display.
 * @param {number|string|null|undefined} score
 * @returns {string|null}
 */
export function format_score(score) {
  const numeric_score = typeof score === 'number' ? score : Number.parseFloat(score);
  if (!Number.isFinite(numeric_score)) return null;
  return Number.parseFloat(numeric_score.toFixed(2)).toString();
}

/**
 * Format a size in bytes into a readable label.
 * @param {number|string|null|undefined} size
 * @returns {string|null}
 */
export function format_size(size) {
  const numeric_size = typeof size === 'number' ? size : Number.parseFloat(size);
  if (!Number.isFinite(numeric_size) || numeric_size < 0) return null;

  const units = ['B', 'KB', 'MB', 'GB'];
  let size_value = numeric_size;
  let unit_index = 0;

  while (size_value >= 1024 && unit_index < units.length - 1) {
    size_value /= 1024;
    unit_index += 1;
  }

  const precision = size_value >= 10 || Number.isInteger(size_value) ? 0 : 1;
  const rounded_value = Number.parseFloat(size_value.toFixed(precision));
  return `${rounded_value.toString()} ${units[unit_index]}`;
}

function build_badge_html(label, class_name) {
  if (!label) return '';
  return `<span class="${class_name}">${escape_html(label)}</span>`;
}

function get_item_ref(context_item) {
  try {
    return context_item?.item_ref || null;
  } catch (error) {
    return null;
  }
}

function get_context_item_exists(context_item) {
  try {
    return context_item?.exists;
  } catch (error) {
    return null;
  }
}

function get_context_item_name(context_item) {
  const item_ref = get_item_ref(context_item);
  const item_key = String(context_item?.key || '');

  if (item_ref?.key) {
    const item_ref_key = String(item_ref.key);
    if (item_ref_key.includes('#')) {
      const name_pcs = item_ref_key.split('/').pop().split('#').filter(Boolean);
      const last_pc = name_pcs.pop();
      if (last_pc && last_pc.startsWith('{')) {
        const lines = Array.isArray(item_ref.lines) ? item_ref.lines.join('-') : '';
        return lines ? `Lines: ${lines}` : last_pc;
      }
      return last_pc;
    }
    return item_ref_key.split('/').pop();
  }

  return item_key.split('/').pop();
}

/**
 * Build the HTML string for a context tree leaf.
 * @param {import('smart-contexts').ContextItem} context_item
 * @param {object} params
 * @returns {string}
 */
export function build_html(context_item, params = {}) {
  const name = get_context_item_name(context_item);
  const item_key = String(context_item?.key || '');
  const score = format_score(context_item?.data?.score);
  const size = format_size(context_item?.size ?? context_item?.data?.size);
  const score_html = build_badge_html(score, 'sc-context-item-score');
  const size_html = build_badge_html(size, 'sc-context-item-size');
  const missing_class = get_context_item_exists(context_item) === false ? ' missing' : '';

  return `<span class="sc-context-item-leaf">
  <span class="sc-context-item-remove" data-path="${escape_html(item_key)}">×</span>
  ${score_html}
  <span class="sc-context-item-name${missing_class}">${escape_html(name || item_key)}</span>
  ${size_html}
  </span>`;
}

export async function render(context_item, params = {}) {
  const html = build_html(context_item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, context_item, container, params);
  return container;
}

async function post_process(context_item, container, params = {}) {
  const remove_btn = container.querySelector('.sc-context-item-remove');
  if (remove_btn) {
    remove_btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof params.on_remove !== 'function') return;
      params.on_remove(event, context_item);
    });
  }

  const name = container.querySelector('.sc-context-item-name');
  if (!name) return container;

  const is_missing = get_context_item_exists(context_item) === false;
  if (is_missing) {
    name.setAttribute('title', 'Missing source');
  }

  const item_ref = get_item_ref(context_item);
  if (item_ref && !is_missing) {
    name.setAttribute('title', `Hold ${Platform.isMacOS ? '⌘' : 'Ctrl'} to preview`);
    register_item_hover_popover(name, item_ref);
  }

  name.addEventListener('click', (event) => {
    if (typeof context_item.open !== 'function') return;
    context_item.open(event);
  });

  return container;
}
