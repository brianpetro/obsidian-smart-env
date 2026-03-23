import styles from './exclusions_list.css';

/**
 * Collect excluded context-item entries from the raw SmartContext map.
 *
 * Exclusions stay out of the primary review tree so active selections remain
 * easy to scan. This component renders them as a separate collapsed list.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Array<{ key: string, data: Record<string, unknown> }>}
 */
function get_excluded_entries(ctx) {
  const context_items = ctx?.data?.context_items || {};

  return Object.entries(context_items)
    .filter(([, item_data]) => item_data?.exclude)
    .map(([key, item_data]) => ({
      key,
      data: item_data && typeof item_data === 'object' ? item_data : {},
    }))
    .sort((left, right) => {
      const left_is_folder = left?.data?.folder === true;
      const right_is_folder = right?.data?.folder === true;
      if (left_is_folder !== right_is_folder) return left_is_folder ? -1 : 1;
      return String(left?.key || '').localeCompare(String(right?.key || ''));
    })
  ;
}

/**
 * Build the exclusions list shell.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {string}
 */
export function build_html(ctx) {
  return `<div class="sc-context-exclusions" data-context-key="${ctx?.data?.key || ''}"></div>`;
}

/**
 * Render the exclusions list for a SmartContext.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ctx, params = {}) {
  this.apply_style_sheet(styles);
  const html = build_html(ctx, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, params);
  return container;
}

/**
 * Attach live exclusions rendering.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function post_process(ctx, container, params = {}) {
  let is_open = false;

  const render_exclusions = () => {
    const excluded_entries = get_excluded_entries(ctx);

    this.empty(container);
    container.hidden = excluded_entries.length === 0;
    if (!excluded_entries.length) {
      is_open = false;
      return;
    }

    const details = container.createEl('details', {
      cls: 'sc-context-exclusions-details',
    });
    details.open = is_open;
    details.addEventListener('toggle', () => {
      is_open = details.open;
    });

    const summary = details.createEl('summary', {
      cls: 'sc-context-exclusions-summary',
    });
    summary.createSpan({
      cls: 'sc-context-exclusions-title',
      text: `Excluded (${excluded_entries.length})`,
    });

    const list = details.createEl('ul', {
      cls: 'sc-context-exclusions-list',
    });

    excluded_entries.forEach((entry) => {
      const row = list.createEl('li', {
        cls: 'sc-context-exclusions-item',
      });

      const remove_btn = row.createEl('button', {
        cls: 'sc-context-exclusions-remove',
        text: '×',
      });
      remove_btn.type = 'button';
      remove_btn.setAttribute('aria-label', `Remove exclusion for ${entry.key}`);
      remove_btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.remove_item(entry.key);
      });

      row.createSpan({
        cls: 'sc-context-exclusions-label',
        text: entry.key,
      });
    });
  };

  render_exclusions();

  const disposers = [];
  disposers.push(ctx.on_event('context:updated', render_exclusions));
  this.attach_disposer(container, disposers);
  return container;
}
