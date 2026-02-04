/**
 * @typedef {object} SuggestionItem
 * @property {string} key           key to add to a SmartContext instance
 * @property {string} display       text shown in the modal
 * @property {function} [select_action]     optional action on select
 * @property {function} [mod_select_action] optional action on ⌘/Ctrl+select
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

/**
 * Determine if the left arrow should trigger suggestion handling.
 *
 * @param {object} modal
 * @param {object} params
 * @param {EventTarget} params.event_target
 * @param {string} params.input_value
 * @returns {boolean}
 */
export const should_handle_arrow_left = (modal, params = {}) => {
  const input_el = modal?.inputEl;
  const event_target = params.event_target;
  const input_value = typeof params.input_value === 'string'
    ? params.input_value
    : (input_el?.value || '');

  if (event_target === input_el && input_value) {
    return false;
  }

  return true;
};
