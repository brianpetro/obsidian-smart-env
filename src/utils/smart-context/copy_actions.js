import { Menu, setIcon } from 'obsidian';
import { context_to_md_tree } from './to_md_tree.js';
import { copy_to_clipboard } from '../copy_to_clipboard.js';

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
export function has_linked_depth_items(ctx) {
  const context_items = ctx?.context_items?.filter?.() || [];
  return context_items.some((context_item) => {
    const depth = Number.isFinite(context_item?.data?.d)
      ? context_item.data.d
      : 0
    ;
    return depth > 0;
  });
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Function|null}
 */
function get_copy_modal_class(ctx) {
  const modal_class = ctx?.env?.config?.modals?.copy_context_modal?.class;
  return typeof modal_class === 'function' ? modal_class : null;
}

/**
 * @param {Menu} menu
 * @param {MouseEvent|KeyboardEvent} event
 * @param {HTMLElement} anchor_el
 * @returns {void}
 */
function show_menu(menu, event, anchor_el) {
  if (event instanceof MouseEvent) {
    menu.showAtMouseEvent(event);
    return;
  }

  const rect = anchor_el.getBoundingClientRect();
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
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {boolean} [params.with_media=false]
 * @returns {boolean}
 */
function open_copy_context_modal(ctx, params = {}) {
  const copy_modal_class = get_copy_modal_class(ctx);
  if (!copy_modal_class) {
    ctx?.emit_event?.('context:copy_modal_missing', {
      level: 'warning',
      message: 'Copy depth chooser is not available.',
      event_source: 'builder.copy_actions.open_copy_context_modal',
    });
    return false;
  }

  const modal = new copy_modal_class(ctx, {
    ...(params.with_media ? { with_media: true } : {}),
  });
  modal.open();
  return true;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Promise<boolean>}
 */
async function copy_link_tree(ctx) {
  const md_tree = context_to_md_tree(ctx).trim();
  if (!md_tree) {
    ctx.emit_event('context:copy_empty', {
      level: 'warning',
      message: 'No link tree to copy.',
      event_source: 'builder.copy_actions.copy_link_tree',
    });
    return false;
  }

  const copied = await copy_to_clipboard(md_tree, {
    env: ctx.env,
    event_source: 'builder.copy_actions.copy_link_tree',
    success_event_key: 'context:clipboard_raw_copied',
    error_event_key: 'context:clipboard_raw_copy_failed',
    unavailable_event_key: 'context:clipboard_copy_unavailable',
  });
  if (!copied) return false;

  ctx.emit_event('context:copied', {
    level: 'info',
    message: 'Copied link tree to clipboard.',
    event_source: 'builder.copy_actions.copy_link_tree',
  });
  return true;
}

/**
 * Build the Builder copy menu actions.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {boolean} [params.supports_media=false]
 * @returns {Array<{ key: string, title: string, icon: string, on_click: Function }>}
 */
export function build_copy_action_descriptors(ctx, params = {}) {
  const supports_media = params.supports_media === true;
  const descriptors = [
    {
      key: 'copy_text',
      title: supports_media ? 'Copy text' : 'Copy current',
      icon: 'copy',
      on_click: () => ctx.actions.context_copy_to_clipboard(),
    },
  ];

  if (supports_media) {
    descriptors.push({
      key: 'copy_media',
      title: 'Copy media',
      icon: 'copy',
      on_click: () => ctx.actions.context_copy_to_clipboard({ with_media: true }),
    });
  }

  if (has_linked_depth_items(ctx) && get_copy_modal_class(ctx)) {
    descriptors.push({
      key: 'copy_depth_text',
      title: supports_media ? 'Copy text (choose link depth)' : 'Copy with link depth',
      icon: 'copy',
      on_click: () => open_copy_context_modal(ctx),
    });

    if (supports_media) {
      descriptors.push({
        key: 'copy_depth_media',
        title: 'Copy media (choose link depth)',
        icon: 'copy',
        on_click: () => open_copy_context_modal(ctx, { with_media: true }),
      });
    }
  }

  descriptors.push({
    key: 'copy_link_tree',
    title: 'Copy link tree',
    icon: 'copy',
    on_click: () => copy_link_tree(ctx),
  });

  return descriptors;
}

/**
 * Open the Builder copy menu.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {MouseEvent|KeyboardEvent} event
 * @param {HTMLElement} anchor_el
 * @param {object} [params={}]
 * @param {boolean} [params.supports_media=false]
 * @returns {void}
 */
export function open_copy_menu(ctx, event, anchor_el, params = {}) {
  const app = ctx?.env?.plugin?.app || window.app || null;
  if (!app) return;

  const menu = new Menu(app);
  const action_descriptors = build_copy_action_descriptors(ctx, params);
  action_descriptors.forEach((descriptor) => {
    menu.addItem((menu_item) => {
      menu_item
        .setTitle(descriptor.title)
        .setIcon(descriptor.icon)
        .onClick(async () => {
          await descriptor.on_click();
        })
      ;
    });
  });

  show_menu(menu, event, anchor_el);
}

/**
 * Render a one-click Builder copy button.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @returns {HTMLButtonElement}
 */
export function render_btn_quick_copy(ctx, container, params = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'clickable-icon sc-copy-clipboard-quick';
  button.setAttribute('aria-label', 'Quick copy current context');
  setIcon(button, 'smart-copy-note');

  const has_active_items = (ctx?.item_count || 0) > 0;
  button.hidden = !has_active_items;
  button.disabled = !has_active_items;

  container.appendChild(button);
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    await ctx.actions.context_copy_to_clipboard();
  });
  return button;
}

/**
 * Render the Builder copy menu trigger button.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @param {boolean} [params.supports_media=false]
 * @returns {HTMLButtonElement}
 */
export function render_btn_copy_menu(ctx, container, params = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sc-copy-context-menu-btn';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', 'Open copy actions');

  const has_active_items = (ctx?.item_count || 0) > 0;
  button.hidden = !has_active_items;
  button.disabled = !has_active_items;

  container.appendChild(button);
  button.addEventListener('click', (event) => {
    if (button.disabled) return;
    open_copy_menu(ctx, event, button, params);
  });
  button.addEventListener('keydown', (event) => {
    if (button.disabled) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open_copy_menu(ctx, event, button, params);
  });
  return button;
}
export function render_btn_clear_context(ctx, container) {
  // const clear_btn = container.querySelector('.sc-clear-context-btn');
  const clear_btn = document.createElement('button');
  clear_btn.type = 'button';
  clear_btn.className = 'sc-clear-context-btn';
  clear_btn.textContent = 'Clear';
  if (!ctx.has_context_items) {
    clear_btn.style.display = 'none';
  }
  container.appendChild(clear_btn);
  clear_btn.addEventListener('click', () => {
    ctx.clear_all();
  });
}
export function render_btn_help(ctx, container) {
  // const help_btn = container.querySelector('.sc-help-btn');
  const help_btn = document.createElement('button');
  help_btn.type = 'button';
  help_btn.className = 'sc-help-btn';
  help_btn.setAttribute('aria-label', 'Learn more');
  container.appendChild(help_btn);
  setIcon(help_btn, 'help-circle');
  help_btn.addEventListener('click', () => {
    window.open('https://smartconnections.app/smart-context/builder/?utm_source=context-selector-modal', '_external');
  });
}

