import { register_item_hover_popover } from 'obsidian-smart-env/src/utils/register_item_hover_popover.js';
import { Platform } from 'obsidian';
import styles from './leaf.css';

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
  return `<span class="${class_name}">${label}</span>`;
}

/**
 * Build the HTML string for a context tree leaf.
 * @param {object} context_item
 * @param {object} params
 * @returns {string}
 */
export function build_html(context_item, params = {}) {
  let name;
  if (context_item.item_ref) {
    if (context_item.item_ref.key.includes('#')) {
      const name_pcs = context_item.item_ref.key.split('/').pop().split('#').filter(Boolean);
      const last_pc = name_pcs.pop();
      const segments = [];
      if (last_pc && last_pc.startsWith('{')) {
        segments.push(name_pcs.pop());
        segments.push(context_item.item_ref.lines.join('-'));
        name = segments.join(' > Lines: ');
      }
    } else {
      name = context_item.item_ref.key.split('/').pop();
    }
  } else {
    name = context_item.key.split('/').pop();
  }

  const score = format_score(context_item?.data?.score);
  const size = format_size(context_item?.size || context_item?.data?.size);
  const score_html = build_badge_html(score, 'sc-context-item-score');
  const size_html = build_badge_html(size, 'sc-context-item-size');

  return `<span class="sc-context-item-leaf">
  <span class="sc-context-item-remove" data-path="${context_item.key}">×</span>
  ${score_html}
  <span class="sc-context-item-name">${name || context_item.key}</span>
  ${size_html}
  </span>`;
}

export async function render(context_item, params={}) {
  this.apply_style_sheet(styles);
  const html = build_html(context_item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, context_item, container, params);
  return container;
}

async function post_process(context_item, container, params={}) {
  const env = context_item.env;
  const remove_btn = container.querySelector('.sc-context-item-remove');
  if (remove_btn) {
    remove_btn.addEventListener('click', (event) => {
      // get from DOM to prevent storing in ContextItem instance
      const target = event.currentTarget;
      const tree_container = target.closest('[data-context-key]');
      const ctx_key = tree_container?.getAttribute('data-context-key');
      const ctx = env.smart_contexts.get(ctx_key);
      ctx.remove_item(context_item.key);
    });
  }
  if(context_item.item_ref) {
    const name = container.querySelector('.sc-context-item-name');
    name.setAttribute('title', `Hold ${Platform.isMacOS ? '⌘' : 'Ctrl'} to preview`);
    register_item_hover_popover(name, context_item.item_ref);
  }
  const name = container.querySelector('.sc-context-item-name');
  name.addEventListener('click', (event) => {
    context_item.open(event);
  });

  return container;
}