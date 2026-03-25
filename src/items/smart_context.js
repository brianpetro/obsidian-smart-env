import { SmartContext as BaseClass } from 'smart-contexts/smart_context.js';

export class SmartContext extends BaseClass {
  /**
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
