/**
 * Retrieve results for the current Lookup List using the selected strategy.
 *
 * The canonical action remains stable while optional strategies register under
 * their own action keys and are selected through Lookup List settings.
 *
 * @this {import('../../items/lookup_list.js').LookupList}
 * @param {object} [params={}]
 * @returns {Promise<Array>}
 */
export async function lookup_list_get_results(params = {}) {
  const action_key = this.settings?.get_results_action_key;
  if (action_key && action_key !== 'lookup_list_get_results') {
    const selected_action = this.actions?.[action_key];
    if (typeof selected_action === 'function') {
      return await selected_action.call(this, params);
    }
  }
  return await this.get_results(params);
}

export const display_name = 'Semantic search';
