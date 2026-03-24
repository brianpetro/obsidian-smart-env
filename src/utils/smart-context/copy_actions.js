import { Menu, setIcon } from 'obsidian';
import { copy_to_clipboard } from '../copy_to_clipboard.js';
import { context_to_md_tree } from './to_md_tree.js';

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
function has_active_context_items(ctx) {
  return Number(ctx?.item_count || 0) > 0;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
function has_any_context_state(ctx) {
  return has_active_context_items(ctx) || Number(ctx?.excluded_item_count || 0) > 0;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
function has_linked_depth_items(ctx) {
  if (!ctx?.context_items?.filter) return false;
  return ctx.context_items
    .filter((item) => !item?.data?.exclude)
    .some((item) => Number.isFinite(item?.data?.d) && item.data.d > 0)
  ;
}

/**
 * @param {HTMLButtonElement} button
 * @param {MouseEvent|KeyboardEvent} event
 * @param {Menu} menu
 * @returns {void}
 */
function show_menu_at_button(button, event, menu) {
  if (event instanceof MouseEvent) {
    menu.showAtMouseEvent(event);
    return;
  }

  const rect = button.getBoundingClientRect();
  if (typeof menu.showAtPosition === 'function') {
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
    return;
  }

  menu.showAtMouseEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left,
    clientY: rect.bottom,
  }));
}

/**
 * @param {HTMLElement} container
 * @param {object} params
 * @param {string} [params.text]
 * @param {string} [params.icon]
 * @param {string} [params.aria_label]
 * @param {boolean} [params.icon_only=false]
 * @returns {HTMLButtonElement}
 */
function create_button(container, params = {}) {
  const button = container.createEl('button', {
    text: params.icon_only ? '' : (params.text || ''),
  });

  if (params.icon) {
    button.classList.add('clickable-icon');
    setIcon(button, params.icon);
  }
  if (params.aria_label) {
    button.setAttribute('aria-label', params.aria_label);
    if (!params.icon_only && !button.textContent) {
      button.textContent = params.aria_label;
    }
  }

  return button;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {boolean} [params.with_media=false]
 * @returns {boolean}
 */
function open_copy_depth_modal(ctx, params = {}) {
  const CopyModalClass = ctx?.env?.config?.modals?.copy_context_modal?.class;
  if (typeof CopyModalClass !== 'function') return false;
  const modal = new CopyModalClass(ctx, params);
  modal.open();
  return true;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {string}
 */
function get_help_url(ctx) {
  const ctx_key = String(ctx?.key || '');
  if (ctx_key.endsWith('#codeblock')) {
    return 'https://smartconnections.app/smart-context/codeblock/?utm_source=context-actions';
  }
  return 'https://smartconnections.app/smart-context/builder/?utm_source=context-actions';
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {boolean} [params.supports_media=false]
 * @returns {boolean}
 */
function should_render_copy_menu(ctx, params = {}) {
  return Boolean(params.supports_media) || has_linked_depth_items(ctx);
}

/**
 * Render the primary quick-copy button.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @param {boolean} [params.supports_media=false]
 * @returns {HTMLButtonElement|null}
 */
export function render_btn_quick_copy(ctx, container, params = {}) {
  if (!has_active_context_items(ctx)) return null;

  const has_copy_menu = should_render_copy_menu(ctx, params);
  const label = has_copy_menu ? 'Copy' : 'Copy to clipboard';
  const button = create_button(container, {
    text: label,
    aria_label: 'Quick copy current context',
  });

  button.addEventListener('click', async () => {
    await ctx.actions.context_copy_to_clipboard();
  });

  return button;
}

/**
 * Render the optional copy menu button.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @param {boolean} [params.supports_media=false]
 * @returns {HTMLButtonElement|null}
 */
export function render_btn_copy_menu(ctx, container, params = {}) {
  if (!has_active_context_items(ctx)) return null;
  if (!should_render_copy_menu(ctx, params)) return null;

  const app = ctx?.env?.plugin?.app || ctx?.env?.obsidian_app || window?.app || globalThis?.app || null;
  if (!app) return null;

  const button = create_button(container, {
    icon: 'chevron-down',
    aria_label: 'Open copy menu',
    icon_only: true,
  });

  const open_menu = (event) => {
    const menu = new Menu(app);
    const can_choose_depth = has_linked_depth_items(ctx) && typeof ctx?.env?.config?.modals?.copy_context_modal?.class === 'function';

    menu.addItem((mi) => {
      mi.setTitle('Quick copy current context')
        .setIcon('copy')
        .onClick(async () => {
          await ctx.actions.context_copy_to_clipboard();
        })
      ;
    });

    menu.addItem((mi) => {
      mi.setTitle('Copy text')
        .setIcon('documents')
        .onClick(async () => {
          if (can_choose_depth && open_copy_depth_modal(ctx)) return;
          await ctx.actions.context_copy_to_clipboard();
        })
      ;
    });

    if (params.supports_media) {
      menu.addItem((mi) => {
        mi.setTitle('Copy media')
          .setIcon('image-file')
          .onClick(async () => {
            if (can_choose_depth && open_copy_depth_modal(ctx, { with_media: true })) return;
            await ctx.actions.context_copy_to_clipboard({ with_media: true });
          })
        ;
      });
    }

    menu.addItem((mi) => {
      mi.setTitle('Copy link tree')
        .setIcon('list-tree')
        .onClick(async () => {
          const md_tree = context_to_md_tree(ctx).trim();
          if (!md_tree) {
            ctx.emit_event('context:copy_empty', {
              level: 'warning',
              message: 'No context items to copy.',
              event_source: 'smart_context.copy_link_tree',
            });
            return;
          }
          await copy_to_clipboard(md_tree, {
            env: ctx.env,
            event_source: 'smart_context.copy_link_tree',
            success_event_key: 'context:clipboard_raw_copied',
            error_event_key: 'context:clipboard_raw_copy_failed',
            unavailable_event_key: 'context:clipboard_copy_unavailable',
          });
        })
      ;
    });

    show_menu_at_button(button, event, menu);
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    open_menu(event);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open_menu(event);
  });

  return button;
}

/**
 * Render the clear button.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @returns {HTMLButtonElement|null}
 */
export function render_btn_clear_context(ctx, container) {
  if (!has_any_context_state(ctx)) return null;

  const button = create_button(container, {
    text: 'Clear',
    aria_label: 'Clear context',
  });
  button.addEventListener('click', () => {
    ctx.clear_all?.();
  });
  return button;
}

/**
 * Render the help button.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @returns {HTMLButtonElement|null}
 */
export function render_btn_help(ctx, container) {
  const button = create_button(container, {
    icon: 'help-circle',
    aria_label: 'Help',
    icon_only: true,
  });
  button.addEventListener('click', () => {
    const url = get_help_url(ctx);
    if (typeof globalThis.open === 'function') {
      globalThis.open(url, '_external');
    }
  });
  return button;
}
