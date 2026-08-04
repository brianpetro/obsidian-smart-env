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
export const version = '3.0.1';

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
    { command: `${MOD_CHAR} + Enter`, purpose: 'Add named context' },
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
 * @returns {Array<{ key: string } & Object.<string, *> >}
 */
function get_items_from_context(other_ctx) {
  const data = other_ctx?.data?.context_items || {};
  const entries = Object.entries(data);

  /** @type {Array<{ key: string } & Object.<string, *> >} */
  const out = [];

  for (let i = 0; i < entries.length; i += 1) {
    const [key, item_data] = entries[i];
    if (!key) continue;
    if (item_data?.exclude) continue;
    out.push({
      ...(item_data && typeof item_data === 'object' ? item_data : {}),
      key: item_data?.key || key,
    });
  }

  return out;
}

/**
 * Copy a persisted context item into the current context as a direct item.
 *
 * @param {{ key: string } & Object.<string, *>} item_data
 * @returns {{ key: string } & Object.<string, *>}
 */
function build_direct_context_item(item_data) {
  const copied_data = { ...item_data };
  delete copied_data.from_folder;
  delete copied_data.from_named_context;
  delete copied_data.d;
  delete copied_data.at;
  delete copied_data.size;
  delete copied_data.mtime;
  delete copied_data.group_items_ct;
  delete copied_data.truncated;
  delete copied_data.truncated_max_items;
  delete copied_data.missing;
  delete copied_data.exclude;
  if (copied_data.folder !== true) delete copied_data.folder;
  return copied_data;
}

/**
 * Add a saved context as one reusable inclusion rule.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {string} context_name
 * @returns {void}
 */
function add_named_context(ctx, context_name) {
  ctx.add_item({
    key: context_name,
    kind: 'named_context',
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
      select_action: () => {
        ctx.add_item(build_direct_context_item(payload));
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
    const current_items = ctx?.data?.context_items || {};
    const already_included = Boolean(
      current_items[other_name]?.named_context
      || Object.values(current_items).some(
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
        return [
          {
            key: other_name,
            display: `Add all: ${other_name} (${item_count})`,
            item: other,
            select_action: ({ modal } = {}) => {
              add_named_context(ctx, other_name);
              return context_suggest_contexts.call(ctx, { modal });
            },
            arrow_left_action: ({ modal } = {}) => {
              return context_suggest_contexts.call(ctx, { modal });
            },
          },
          ...build_named_context_item_suggestions(ctx, {
            other_ctx: other,
            context_name: other_name,
            modal,
          })
        ];
      },
      arrow_right_action: ({ modal }) => {
        return build_named_context_item_suggestions(ctx, {
          other_ctx: other,
          context_name: other_name,
          modal,
        });
      },
      mod_select_action: ({ modal } = {}) => {
        add_named_context(ctx, other_name);
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
