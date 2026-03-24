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
export function has_linked_depth_items(ctx) {
  if (!ctx?.context_items?.filter) return false;
  return ctx.context_items
    .filter((item) => !item?.data?.exclude)
    .some((item) => Number.isFinite(item?.data?.d) && item.data.d > 0)
  ;
}

/**
 * Resolve the Pro "Copy with media" preference.
 *
 * This helper intentionally accepts either a SmartContext instance or an env-like
 * object so command helpers can read the setting without needing a context first.
 *
 * @param {any} scope
 * @returns {boolean}
 */
export function get_copy_with_media_setting(scope) {
  const env = scope?.env || scope || null;
  if (!env?.is_pro) return false;
  return Boolean(
    env?.smart_contexts?.settings?.actions?.context_copy_to_clipboard?.copy_with_media,
  );
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
 * Copy the current context as a markdown link tree.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Promise<boolean>}
 */
async function copy_link_tree(ctx) {
  const md_tree = context_to_md_tree(ctx).trim();
  if (!md_tree) {
    ctx.emit_event('context:copy_empty', {
      level: 'warning',
      message: 'No context items to copy.',
      event_source: 'smart_context.copy_link_tree',
    });
    return false;
  }

  const copied = await copy_to_clipboard(md_tree, {
    env: ctx.env,
    event_source: 'smart_context.copy_link_tree',
    success_event_key: 'context:clipboard_raw_copied',
    error_event_key: 'context:clipboard_raw_copy_failed',
    unavailable_event_key: 'context:clipboard_copy_unavailable',
  });
  if (!copied) return false;

  ctx.emit_event('context:link_tree_copied', {
    level: 'info',
    message: 'Copied link tree to clipboard.',
    event_source: 'smart_context.copy_link_tree',
  });
  return true;
}

/**
 * Build the descriptor list used by the Copy menu.
 *
 * Keeping this data-driven lets the menu and tests share one canonical source
 * of truth while also making it easier to add or retire actions later.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {boolean} [params.supports_media=false]
 * @returns {Array<{
 *   key: string,
 *   title: string,
 *   icon: string,
 *   run: () => Promise<boolean|void>|boolean|void,
 * }>}
 */
export function build_copy_action_descriptors(ctx, params = {}) {
  if (!has_active_context_items(ctx)) return [];

  const can_choose_depth = has_linked_depth_items(ctx)
    && typeof ctx?.env?.config?.modals?.copy_context_modal?.class === 'function'
  ;

  /** @type {Array<{ key: string, title: string, icon: string, run: () => Promise<boolean|void>|boolean|void }>} */
  const descriptors = [
    {
      key: 'copy_text',
      title: 'Copy text',
      icon: 'copy',
      run: async () => {
        return await ctx.actions.context_copy_to_clipboard({ with_media: false });
      },
    },
  ];
  // Pro: configurable copy button
  if (ctx?.env?.is_pro) {
    descriptors.unshift({
      is_separator: true,
    });
    descriptors.unshift({
      key: 'smart_copy',
      title: 'Smart Copy',
      icon: 'smart-copy-note',
      run: async () => {
        // TODO: replace with ctx.actions.context_smart_copy() (implemented in smart-context-obsidian-early)
        return await ctx.actions.context_copy_to_clipboard();
      },
    });
  }

  if (params.supports_media) {
    descriptors.push({
      key: 'copy_media',
      title: 'Copy media',
      icon: 'image-file',
      run: async () => {
        return await ctx.actions.context_copy_to_clipboard({ with_media: true });
      },
    });
  }

  if (can_choose_depth) {
    descriptors.push({
      key: 'copy_depth_text',
      title: 'Copy text (choose link depth)',
      icon: 'copy',
      run: async () => {
        return open_copy_depth_modal(ctx, { with_media: false });
      },
    });

    if (params.supports_media) {
      descriptors.push({
        key: 'copy_depth_media',
        title: 'Copy media (choose link depth)',
        icon: 'image-file',
        run: async () => {
          return open_copy_depth_modal(ctx, { with_media: true });
        },
      });
    }
  }

  descriptors.push({
    key: 'copy_link_tree',
    title: 'Copy link tree',
    icon: 'list-tree',
    run: async () => {
      return await copy_link_tree(ctx);
    },
  });

  return descriptors;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {boolean} [params.supports_media=false]
 * @returns {boolean}
 */
function should_render_copy_menu(ctx, params = {}) {
  return build_copy_action_descriptors(ctx, params).length > 1;
}

/**
 * Render the primary quick-copy button.
 *
 * This stays text-only on purpose so there is always a predictable one-click
 * copy path regardless of Pro media preferences.
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
    aria_label: 'Smart Copy',
  });

  button.addEventListener('click', async () => {
    // TODO: replace with ctx.actions.context_smart_copy() (implemented in smart-context-obsidian-early)
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
    text: 'Copy',
    aria_label: 'Open copy menu',
  });

  const open_menu = (event) => {
    const menu = new Menu(app);
    const descriptors = build_copy_action_descriptors(ctx, params);

    descriptors.forEach((descriptor) => {
      if (descriptor.is_separator) {
        menu.addSeparator();
        return;
      }
      menu.addItem((mi) => {
        mi.setTitle(descriptor.title)
          .setIcon(descriptor.icon)
          .onClick(async () => {
            await descriptor.run();
          })
        ;
      });
    });

    menu.addSeparator();

    menu.addItem((mi) => {
      mi.setTitle('Clear this context')
        .setIcon('rotate-ccw')
        .onClick(() => {
          ctx.clear_all?.();
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
