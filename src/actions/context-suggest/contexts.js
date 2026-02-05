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

/**
 * @param {object} modal
 * @returns {void}
 */
function set_named_context_list_instructions(modal) {
  modal?.setInstructions?.([
    { command: 'Enter / →', purpose: 'Browse context items' },
    { command: '⌘/Ctrl + Enter', purpose: 'Add all items from context' },
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
 * @param {Array<{ key: string, d: number }>} items
 * @returns {Array<{ key: string, d: number }>}
 */
function normalize_items_preserving_depth(ctx, items) {
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item.key !== 'string') continue;
    const incoming_depth = Number.isFinite(item.d) ? item.d : 0;

    const existing = ctx?.data?.context_items?.[item.key];
    const existing_depth = Number.isFinite(existing?.d) ? existing.d : null;

    out.push({
      key: item.key,
      d: existing_depth === null ? incoming_depth : Math.min(existing_depth, incoming_depth),
    });
  }
  return out;
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
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {Array<{ key: string, d: number }>} params.items
 * @param {string} params.context_name
 * @returns {Array<{ key: string, d: number, from_named_context: string }>}
 */
function build_codeblock_named_context_items(ctx, params = {}) {
  const items = Array.isArray(params.items) ? params.items : [];
  const context_name = params.context_name;
  return normalize_items_preserving_depth(ctx, items).map((item) => ({
    ...item,
    from_named_context: context_name,
  }));
}

/**
 * @param {any} other_ctx
 * @returns {Array<{ key: string, d: number }>}
 */
function get_items_from_context(other_ctx) {
  const data = other_ctx?.data?.context_items || {};
  const entries = Object.entries(data);

  /** @type {Array<{ key: string, d: number }>} */
  const out = [];

  for (let i = 0; i < entries.length; i += 1) {
    const [key, item_data] = entries[i];
    if (!key) continue;
    if (item_data?.exclude) continue;
    const depth = Number.isFinite(item_data?.d) ? item_data.d : 0;
    out.push({ key, d: depth });
  }

  return out;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {any} params.other_ctx
 * @param {string} params.context_name
 * @param {boolean} [params.include_named_context]
 * @returns {Array<{ key: string, d: number, from_named_context?: string }>}
 */
function build_named_context_item_payloads(ctx, params = {}) {
  const other_ctx = params.other_ctx;
  const context_name = params.context_name;
  const include_named_context = Boolean(params.include_named_context);
  const items = get_items_from_context(other_ctx);
  if (is_codeblock_context(ctx)) {
    return build_codeblock_named_context_items(ctx, { items, context_name });
  }
  const normalized_items = normalize_items_preserving_depth(ctx, items);
  if (!include_named_context) return normalized_items;
  return normalized_items.map((item) => ({
    ...item,
    from_named_context: context_name,
  }));
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Array<{ key: string, d: number, from_named_context?: string }>} payloads
 * @returns {void}
 */
function add_context_payloads(ctx, payloads = []) {
  if (!payloads.length) return;
  if (typeof ctx?.add_items === 'function') {
    ctx.add_items(payloads);
    return;
  }
  if (typeof ctx?.add_item === 'function') {
    payloads.forEach((payload) => ctx.add_item(payload));
  }
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} params
 * @param {any} params.other_ctx
 * @param {string} params.context_name
 * @param {Array<{ key: string, d: number, from_named_context?: string }>} [params.payloads]
 * @param {boolean} [params.include_named_context]
 * @returns {Array<{ key: string, d: number, from_named_context?: string }>}
 */
function add_named_context_items(ctx, params = {}) {
  const payloads = Array.isArray(params.payloads)
    ? params.payloads
    : build_named_context_item_payloads(ctx, params);
  if (!payloads.length) return [];
  if (is_codeblock_context(ctx)) {
    update_codeblock_named_contexts(ctx, { context_name: params.context_name });
  }
  add_context_payloads(ctx, payloads);
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
        const payloads = add_named_context_items(ctx, {
          other_ctx: other,
          context_name: other_name,
          include_named_context: true,
        });
        if (modal?.setInstructions) {
          const purpose = payloads.length
            ? `Added ${payloads.length} item(s) from ${other_name}`
            : `No items to add from ${other_name}`;
          modal.setInstructions([{ command: 'Enter', purpose }]);
        }
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
