import { register_item_hover_popover } from '../../utils/register_item_hover_popover.js';
import { Platform, setIcon } from 'obsidian';
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

/**
 * Format the context item size as percent of the current context.
 * @param {number|string|null|undefined} size
 * @param {number|string|null|undefined} context_size
 * @returns {string|null}
 */
export function format_size_percent(size, context_size) {
  const numeric_size = typeof size === 'number' ? size : Number.parseFloat(size);
  const numeric_context_size = typeof context_size === 'number' ? context_size : Number.parseFloat(context_size);
  if (!Number.isFinite(numeric_size) || numeric_size < 0) return null;
  if (!Number.isFinite(numeric_context_size) || numeric_context_size <= 0) return null;

  const percent_value = (numeric_size / numeric_context_size) * 100;
  const precision = percent_value >= 10 || Number.isInteger(percent_value) ? 0 : 1;
  const rounded_value = Number.parseFloat(percent_value.toFixed(precision));
  return `${rounded_value.toString()}%`;
}

/**
 * Format the displayed size badge.
 * @param {number|string|null|undefined} size
 * @param {number|string|null|undefined} context_size
 * @returns {string|null}
 */
export function format_size_label(size, context_size) {
  const size_label = format_size(size);
  if (!size_label) return null;

  const percent_label = format_size_percent(size, context_size);
  if (!percent_label) return size_label;

  return `${percent_label} (${size_label})`;
}

function build_badge_html(label, class_name, params = {}) {
  if (!label) return '';
  const icon_attr = params.icon ? ` data-icon="${escape_html(params.icon)}"` : '';
  const tooltip = params.title ? ` aria-label="${escape_html(params.title)}"` : '';
  const named_context_attr = params.named_context ? ` role="button" data-named-context="${escape_html(params.named_context)}"` : '';
  const icon_html = params.icon ? '<span class="sc-context-item-badge-icon"></span>' : '';
  const label_html = params.icon
    ? `` // no text if there's an icon, to save space
    : escape_html(label)
  ;
  return `<span class="${class_name}"${icon_attr}${tooltip}${named_context_attr}>${icon_html}${label_html}</span>`;
}

function get_context_item_name(context_item) {
  const item_ref = context_item?.item_ref || null;
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

function get_folder_source(context_item) {
  const data = context_item?.data || {};
  if (typeof data.from_folder === 'string' && data.from_folder.trim()) return data.from_folder;
  if (typeof data.folder === 'string' && data.folder.trim()) return data.folder;
  if (data.folder === true) return data.key || context_item?.key || '';
  return '';
}

function format_folder_badge_label(folder_source = '') {
  const normalized = String(folder_source || '')
    .replace(/^external:/, '')
    .replace(/\\+/g, '/')
    .replace(/\/+$/g, '')
  ;
  return normalized.split('/').filter(Boolean).pop() || normalized;
}

function get_origin_badges(context_item) {
  const data = context_item?.data || {};
  const badges = [];
  const folder_source = get_folder_source(context_item);
  if (folder_source) {
    badges.push({
      icon: 'folder',
      label: format_folder_badge_label(folder_source),
      title: `Included from folder: ${folder_source}`,
      class_name: 'sc-context-item-origin-badge sc-context-item-origin-folder',
    });
  }

  const named_context = typeof data.from_named_context === 'string'
    ? data.from_named_context.trim()
    : ''
  ;
  if (named_context) {
    badges.push({
      icon: 'smart-named-contexts',
      label: named_context,
      named_context,
      title: `Included from named context: ${named_context}`,
      class_name: 'sc-context-item-origin-badge sc-context-item-origin-named-context',
    });
  }

  return badges;
}

function build_origin_badges_html(context_item) {
  const badges = get_origin_badges(context_item);
  if (!badges.length) return '';
  return `<span class="sc-context-item-origin-badges">${badges
    .map((badge) => build_badge_html(badge.label, badge.class_name, badge))
    .join('')}</span>`;
}

function build_missing_badge_html(context_item) {
  if (context_item?.exists !== false) return '';
  return build_badge_html('Missing', 'sc-context-item-origin-badge sc-context-item-warning-badge', {
    icon: 'alert-triangle',
    title: 'Missing source',
  });
}

function render_inline_icons(container) {
  container.querySelectorAll('[data-icon]').forEach((icon_el) => {
    const icon = icon_el.getAttribute('data-icon');
    if (!icon) return;
    const target = icon_el.querySelector('.sc-context-item-badge-icon') || icon_el;
    setIcon(target, icon);
  });
}

function set_remove_pending(remove_btn) {
  remove_btn.classList.add('is-removing');
  remove_btn.textContent = '';
  remove_btn.setAttribute('aria-label', 'Removing item');
  remove_btn.setAttribute('aria-busy', 'true');
}

function clear_remove_pending(remove_btn) {
  remove_btn.classList.remove('is-removing');
  remove_btn.textContent = '×';
  remove_btn.removeAttribute('aria-busy');
  remove_btn.setAttribute('aria-label', 'Remove item');
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
  const item_size = context_item?.size ?? context_item?.data?.size;
  const size = format_size_label(item_size, params.context_size);
  const score_html = build_badge_html(score, 'sc-context-item-score');
  const size_html = build_badge_html(size, 'sc-context-item-size');
  const missing_badge_html = build_missing_badge_html(context_item);
  const origin_badges_html = build_origin_badges_html(context_item);
  const icon_type = context_item?.icon_type || null;
  const icon_html = icon_type
    ? `<span class="sc-context-item-type-icon" data-icon="${escape_html(icon_type)}"></span>`
    : ''
  ;
  const missing_class = context_item?.exists === false ? ' missing' : '';
  const remove_disabled = params.remove_disabled === true;
  const remove_class = remove_disabled
    ? 'sc-context-item-remove is-disabled'
    : 'sc-context-item-remove'
  ;
  const remove_label = remove_disabled
    ? 'Open named context to edit included item'
    : 'Remove item'
  ;
  const remove_disabled_attr = remove_disabled ? ' aria-disabled="true"' : '';

  return `<span class="sc-context-item-leaf">
  <span class="${remove_class}" data-path="${escape_html(item_key)}" aria-label="${escape_html(remove_label)}"${remove_disabled_attr}>×</span>
  ${score_html}
  ${icon_html}
  <span class="sc-context-item-name${missing_class}">${escape_html(name || item_key)}</span>
  ${size_html}
  ${missing_badge_html}
  ${origin_badges_html}
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
  render_inline_icons(container);

  const remove_btn = container.querySelector('.sc-context-item-remove');
  if (remove_btn) {
    if (params.remove_disabled === true) {
      remove_btn.setAttribute('title', 'Open the named context to remove this included item.');
    }

    remove_btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (params.remove_disabled === true) {
        if (typeof params.on_remove_disabled === 'function') {
          params.on_remove_disabled(event, context_item);
        }
        return;
      }
      if (typeof params.on_remove !== 'function') return;
      if (remove_btn.classList.contains('is-removing')) return;
      set_remove_pending(remove_btn);
      try {
        const result = params.on_remove(event, context_item);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            clear_remove_pending(remove_btn);
            console.warn('Smart Context: Failed to remove context item', error);
          });
        }
      } catch (error) {
        clear_remove_pending(remove_btn);
        throw error;
      }
    });
  }

  const name = container.querySelector('.sc-context-item-name');
  if (!name) return container;

  const is_missing = context_item?.exists === false;
  if (is_missing) {
    name.setAttribute('title', 'Missing source');
  }

  const item_ref = context_item?.item_ref || null;
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


