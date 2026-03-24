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
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
function is_codeblock_context(ctx) {
  const ctx_key = ctx?.key;
  return typeof ctx_key === 'string' && ctx_key.endsWith('#codeblock');
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {string} params.context_name
 * @returns {string[]}
 */
function update_codeblock_named_contexts(ctx, params = {}) {
  const context_name = params.context_name;
  if (!ctx?.data) ctx.data = {};
  const existing = Array.isArray(ctx?.data?.codeblock_named_contexts)
    ? ctx.data.codeblock_named_contexts
    : [];
  const named_contexts = new Set(existing);

  if (context_name) {
    named_contexts.add(context_name);
  }

  ctx.data.codeblock_named_contexts = [...named_contexts];
  return ctx.data.codeblock_named_contexts;
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
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {any} params.other_ctx
 * @param {string} params.context_name
 * @param {boolean} [params.include_named_context]
 * @returns {Array<{ key: string, from_named_context?: string }>}
 */
function build_named_context_item_payloads(ctx, params = {}) {
  const other_ctx = params.other_ctx;
  const context_name = params.context_name;
  const include_named_context = Boolean(params.include_named_context);
  const items = get_items_from_context(other_ctx);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item.key !== 'string') continue;
    if (!include_named_context) continue;
    item.from_named_context = context_name;
  }
  return items;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {any} params.other_ctx
 * @param {string} params.context_name
 * @param {Array<{ key: string, from_named_context?: string }>} [params.payloads]
 * @param {boolean} [params.include_named_context]
 * @returns {Array<{ key: string, from_named_context?: string }>}
 */
function add_named_context_items(ctx, params = {}) {
  const payloads = Array.isArray(params.payloads)
    ? params.payloads
    : build_named_context_item_payloads(ctx, params);
  if (!payloads.length) return [];
  if (is_codeblock_context(ctx) && params.include_named_context) {
    update_codeblock_named_contexts(ctx, { context_name: params.context_name });
  }
  ctx.add_items(payloads);
  return payloads;
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
  const payloads = build_named_context_item_payloads(ctx, {
    ...params,
    include_named_context: false,
  });
  set_named_context_item_instructions(params?.modal, { context_name: params.context_name });
  return payloads
    .filter((payload) => typeof payload?.key === 'string' && payload.key.length)
    .map((payload) => ({
      key: payload.key,
      display: payload.key,
      display_right: format_depth_label(payload.d),
      select_action: ({ modal } = {}) => {
        add_named_context_items(ctx, {
          context_name: params.context_name,
          payloads: [payload],
          include_named_context: false,
        });
        set_named_context_item_instructions(modal, { context_name: params.context_name });
      },
      arrow_left_action: ({ modal } = {}) => {
        return context_suggest_contexts.call(ctx, { modal });
      },
    }));
}

/**
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params]
 * @param {object} [params.modal]
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
    const already_included = Boolean(
      ctx?.data?.context_items &&
      Object.values(ctx.data.context_items).some(
        (item) => item?.from_named_context === other_name
          || item?.key === other_key
      )
    );
    if (already_included) continue;
    const item_count = other?.item_count || Object.keys(other?.data?.context_items || {}).length;

    suggestions.push({
      key: `named_context:${other_key}`,
      display: `${other_name} (${item_count})`,
      item: other,
      select_action: ({ modal }) => {
        return build_named_context_item_suggestions(ctx, {
          other_ctx: other,
          context_name: other_name,
          modal,
        });
      },
      arrow_right_action: ({ modal }) => {
        return build_named_context_item_suggestions(ctx, {
          other_ctx: other,
          context_name: other_name,
          modal,
        });
      },
      mod_select_action: ({ modal } = {}) => {
        ctx.add_item({
          key: `${other_key}`,
          named_context: true,
        });
        return context_suggest_contexts.call(ctx, { modal });
      },
    });
  }

  return suggestions;
}

export default {
  display_name,
  context_suggest_contexts,
};
