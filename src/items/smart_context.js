import { SmartContext as BaseClass } from 'smart-contexts/smart_context.js';
import { get_nested_context_item_keys } from '../utils/smart-context/tree_utils.js';

export class SmartContext extends BaseClass {
  /**
   * Handles removal of a context item by path, which may be a synthetic folder.
   * Removes any nested context items and adds an exclusion marker if the target is a synthetic folder.
   *
   * @param {string} target_path
   */
  remove_by_path(target_path, params = {}) {
    const item_data = this.data?.context_items?.[target_path];
    if (item_data) {
      delete this.data.context_items[target_path];
    } else {
      this.data.context_items[target_path] = {
        key: target_path,
        exclude: true,
        ...(params.folder ? { folder: true } : {}),
      };
    }
    this.emit_event('context:updated', {
      removed_key: target_path,
      ...(params.folder ? { folder: true } : {}),
    });

    this.queue_save();

  }
}
