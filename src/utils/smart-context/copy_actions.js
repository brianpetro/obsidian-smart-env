import { Menu, setIcon } from 'obsidian';

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
export function has_linked_depth_items(ctx) {
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
  if (typeof MouseEvent !== 'undefined' && event instanceof MouseEvent) {
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
  if (params.aria_label || params.text) {
    button.setAttribute('aria-label', params.aria_label || params.text);
    if (!params.icon_only && !params.text) {
      button.textContent = params.aria_label;
    }
  }

  return button;
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
 * Add registered Smart Context menu entries.
 *
 * Menu action scopes:
 * - smart_context:copy_menu -> copy/export actions for the current context
 * - smart_context:actions_menu -> other context-level actions for the current context
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Menu} menu
 * @param {object} [params={}]
 * @returns {Menu}
 */
export function build_context_actions_menu(ctx, menu, params = {}) {
  if (!ctx || !menu) return menu;

  ctx?.env?.build_menu?.('smart_context:copy_menu', menu, ctx, params);
  menu.addSeparator();

  ctx?.env?.build_menu?.('smart_context:action_menu', menu, ctx, params);
  menu.addSeparator();

  ctx?.env?.build_menu?.('smart_contexts:menu', menu, ctx.collection, params);

  return menu;
}

/**
 * Render the primary text-copy button.
 *
 * This stays text-only on purpose so there is always a predictable one-click
 * copy path regardless of Pro media commands.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @returns {HTMLButtonElement|null}
 */
export function render_btn_quick_copy(ctx, container, params = {}) { // eslint-disable-line no-unused-vars
  if (!has_active_context_items(ctx)) return null;

  const button = create_button(container, {
    icon: 'smart-copy-note',
    icon_only: true,
    aria_label: 'Copy text',
  });

  button.addEventListener('click', async () => {
    // TODO: replace with ctx.actions.context_smart_copy() (implemented in smart-context-obsidian-early)
    await ctx.actions.context_copy_to_clipboard({ with_media: false });
  });

  return button;
}

/**
 * Render the optional copy menu button.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @returns {HTMLButtonElement|null}
 */
export function render_btn_copy_menu(ctx, container, params = {}) {
  if (!has_active_context_items(ctx)) return null;

  const app = ctx?.env?.plugin?.app || ctx?.env?.obsidian_app || globalThis?.app || null;
  if (!app) return null;

  const button = create_button(container, {
    icon: 'chevron-down',
    text: 'Copy',
    aria_label: 'Open copy menu',
  });

  const open_menu = (event) => {
    const menu = new Menu(app);
    build_context_actions_menu(ctx, menu, params);
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
    icon: 'rotate-ccw',
    icon_only: true,
  });
  button.addEventListener('click', () => {
    if (!button.dataset.confirmed) {
      button.dataset.confirmed = 'true';
      button.style.backgroundColor = 'var(--color-red)';
      return;
    }
    ctx.clear_all?.();
    button.dataset.confirmed = '';
    button.style.backgroundColor = '';
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
