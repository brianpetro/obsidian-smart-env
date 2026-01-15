/**
 * @typedef {object} SuggestionItem
 * @property {string} key           key to add to a SmartContext instance
 * @property {string} display       text shown in the modal
 * @property {function} [select_action]     optional action on select
 * @property {function} [mod_select_action] optional action on mod+select
 * @property {function} [shift_select_action] optional action on shift+select
 */

/**
 * @param {object} modal
 * @param {object} [params]
 * @param {string[]} [params.action_keys]
 * @returns {SuggestionItem[]}
 */
export function build_suggest_scope_items(modal, params = {}) {
  if (!modal) return [];
  const action_keys = Array.isArray(params.action_keys) ? params.action_keys : [];
  const action_configs = modal?.env?.config?.actions || {};
  const action_handlers = modal?.item_or_collection?.actions || {};
  const unique_action_keys = [...new Set(action_keys)];
  return unique_action_keys.reduce((acc, action_key) => {
    const action_handler = action_handlers[action_key];
    if (typeof action_handler !== 'function') return acc;
    const action_config = action_configs[action_key] || {};
    const display_name = action_config.display_name || action_key;
    acc.push({
      select_action: () => {
        modal.update_suggestions(action_key);
      },
      key: action_key,
      display: display_name,
    });
    return acc;
  }, []);
}
