import { Platform } from 'obsidian';
/**
 * @file contexts.js
 *
 * Suggest action for named Smart Contexts.
 */

/**
 * @typedef {object} Suggestion
 * @property {string} key
 * @property {string} display
 * @property {Function} [select_action]
 * @property {Function} [mod_select_action]
 * @property {Function} [shift_select_action]
 * @property {Function} [arrow_right_action]
 * @property {Function} [arrow_left_action]
 * @property {any} [item]
 */

export const display_name = 'Add named contexts';
export const display_description = 'Reuse a saved context or browse its sources.';
export const version = '1.0.2';

export const menus = {
  'smart_context:suggest': {
    title: 'Named contexts',
    icon: 'smart-named-contexts',
    order: 30,
  },
};

const MOD_CHAR = Platform.isMacOS ? '⌘' : 'Ctrl';

/**
 * @param {object} modal
 * @returns {void}
 */
function set_named_context_list_instructions(modal) {
  modal?.setInstructions?.([
    { command: 'Enter / →', purpose: 'Browse context items' },
    { command: `${MOD_CHAR} + Enter`, purpose: 'Add all items from context' },
  ]);
}

/**
 * @param {object} modal
 * @param {object} params
 * @param {string} params.context_name
 * @returns {void}
 */
function set_named_context_item_instructions(modal, params = {}) {
  const context_name = params.context_name;
  modal?.setInstructions?.([
    { command: 'Enter', purpose: `Add item from ${context_name || 'context'}` },
    { command: '←', purpose: 'Back to named contexts' },
  ]);
}

/**
 * @param {any} env
 * @returns {any[]}
 */
function list_context_items(env) {
  const collection = env?.smart_contexts;
  const items = collection?.items;
  if (!items || typeof items !== 'object') return [];
  return Object.values(items).filter(Boolean);
}

/**
 * @param {any} other_ctx
 * @returns {Array<{ key: string }>}
 */
function get_items_from_context(other_ctx) {
  const data = other_ctx?.data?.context_items || {};
  const entries = Object.entries(data);

  /** @type {Array<{ key: string }>} */
  const out = [];

  for (let i = 0; i < entries.length; i += 1) {
    const [key, item_data] = entries[i];
    if (!key) continue;
    if (item_data?.exclude) continue;
    out.push({ key });
  }

  return out;
}

/**
 * Copy active context item data without retaining named-context origin state.
 *
 * @param {any} other_ctx
 * @returns {Array<{ key: string }>}
 */
function get_copied_items_from_context(other_ctx) {
  const context_items = other_ctx?.data?.context_items || {};
  return get_items_from_context(other_ctx).map(({ key }) => {
    const copied_item = {
      ...(context_items[key] || {}),
      key,
    };
    delete copied_item.from_named_context;
    return copied_item;
  });
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {string} params.context_name
 * @param {Array<{ key: string }>} params.context_items
 * @param {boolean} [params.copy_context_items]
 * @returns {void}
 */
function add_named_context(ctx, params = {}) {
  if (params.copy_context_items === true) {
    ctx.add_items(params.context_items || []);
    return;
  }

  ctx.add_item({
    key: params.context_name,
    named_context: true,
  });
}

/**
 * @param {unknown} depth
 * @returns {string}
 */
function format_depth_label(depth) {
  if (!Number.isFinite(depth)) return '';
  return `depth ${depth}`;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {any} params.other_ctx
 * @param {string} params.context_name
 * @param {object} params.modal
 * @returns {Suggestion[]}
 */
function build_named_context_item_suggestions(ctx, params = {}) {
  const payloads = get_items_from_context(params.other_ctx);
  set_named_context_item_instructions(params?.modal, { context_name: params.context_name });
  return payloads
    .filter((payload) => typeof payload?.key === 'string' && payload.key.length)
    .map((payload) => ({
      key: payload.key,
      display: payload.key,
      display_right: format_depth_label(payload.d),
      select_action: ({ modal } = {}) => {
        ctx.add_item(payload);
      },
      arrow_left_action: ({ modal } = {}) => {
        return context_suggest_contexts.call(ctx, {
          modal,
          copy_context_items: params.copy_context_items,
        });
      },
    }));
}

/**
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params]
 * @param {object} [params.modal]
 * @param {boolean} [params.copy_context_items=false]
 * @returns {Promise<Suggestion[]>}
 */
export async function context_suggest_contexts(params = {}) {
  const ctx = this;
  const env = ctx?.env;

  const modal = params?.modal;
  set_named_context_list_instructions(modal);

  const contexts = list_context_items(env)
    .filter((context_item) => {
      const name = context_item?.data?.name;
      return typeof name === 'string' && name.trim().length > 0;
    })
    .sort((a, b) => {
      const name_a = String(a.data.name).trim().toLowerCase();
      const name_b = String(b.data.name).trim().toLowerCase();
      return name_a.localeCompare(name_b);
    });

  if (!contexts.length) {
    return [{ key: 'contexts:none', display: 'No named contexts found' }];
  }

  /** @type {Suggestion[]} */
  const suggestions = [];

  for (let i = 0; i < contexts.length; i += 1) {
    const other = contexts[i];
    const other_key = other?.key || other?.data?.key;
    const other_name = String(other?.data?.name || '').trim();
    const copied_items = get_copied_items_from_context(other);
    const current_items = ctx?.data?.context_items || {};
    const already_included = params.copy_context_items === true
      ? copied_items.length > 0 && copied_items.every((item) => current_items[item.key])
      : Boolean(
        current_items[other_name]?.named_context
        || Object.values(current_items).some(
          (item) => item?.from_named_context === other_name
            || item?.key === other_key
        )
      )
    ;
    if (already_included) continue;
    const item_count = other?.item_count || Object.keys(other?.data?.context_items || {}).length;

    suggestions.push({
      key: `named_context:${other_key}`,
      display: `${other_name} (${item_count})`,
      item: other,
      select_action: ({ modal }) => {
        return [
          {
            key: other_name,
            display: `Add all: ${other_name} (${item_count})`,
            item: other,
            select_action: ({ modal } = {}) => {
              add_named_context(ctx, {
                context_name: other_name,
                context_items: copied_items,
                copy_context_items: params.copy_context_items,
              });
              return context_suggest_contexts.call(ctx, {
                modal,
                copy_context_items: params.copy_context_items,
              });
            },
            arrow_left_action: ({ modal } = {}) => {
              return context_suggest_contexts.call(ctx, {
                modal,
                copy_context_items: params.copy_context_items,
              });
            },
          },
          ...build_named_context_item_suggestions(ctx, {
            other_ctx: other,
            context_name: other_name,
            modal,
            copy_context_items: params.copy_context_items,
          })
        ]
      },
      arrow_right_action: ({ modal }) => {
        return build_named_context_item_suggestions(ctx, {
          other_ctx: other,
          context_name: other_name,
          modal,
          copy_context_items: params.copy_context_items,
        });
      },
      mod_select_action: ({ modal } = {}) => {
        add_named_context(ctx, {
          context_name: other_name,
          context_items: copied_items,
          copy_context_items: params.copy_context_items,
        });
        return context_suggest_contexts.call(ctx, {
          modal,
          copy_context_items: params.copy_context_items,
        });
      },
    });
  }

  return suggestions;
}

export default {
  display_name,
  context_suggest_contexts,
};
