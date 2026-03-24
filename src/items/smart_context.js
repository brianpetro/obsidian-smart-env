import { SmartContext as BaseClass } from 'smart-contexts/smart_context.js';
import { get_nested_context_item_keys } from '../utils/smart-context/tree_utils';


export class SmartContext extends BaseClass {
  /**
   * Handles removal of a context item by path, which may be a synthetic folder.
   * Removes any nested context items and adds an exclusion marker if the target is a synthetic folder.
   *
   * @param {string} target_path
   * @returns {string[]} removed keys
   */
  remove_by_path(target_path) {
    const nested_keys = get_nested_context_item_keys(this, { target_path });
    const existing_item = this?.data?.context_items?.[target_path] || null;
    const is_folder_path = !existing_item && nested_keys.length > 0;
    const is_from_named = Boolean(existing_item?.from_named_context);

    const removed_keys = this.remove_items(
      nested_keys,
      { emit_updated: false } // emit below to include synthetic folder exclusion in one update
    );
    if (is_folder_path || is_from_named) {
      this.data.context_items[target_path] = {
        ...(this.data.context_items[target_path] || {}),
        ...(is_folder_path ? { folder: true } : {}),
        key: target_path,
        exclude: true,
      };
    }
    if (!removed_keys.length && !is_folder_path) return [];

    this.queue_save();
    this.emit_event('context:updated', {
      removed_keys,
      exclusion_key: is_folder_path ? target_path : null,
    });

    return removed_keys;
  }
}
