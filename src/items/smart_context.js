import { SmartContext as BaseClass } from 'smart-contexts/smart_context.js';

export class SmartContext extends BaseClass {
  get named_contexts () {
    return Object.entries(this.data?.context_items || {})
      .filter(([name, item_data]) => item_data?.named_context)
      .map(([name, item_data]) => this.env.smart_contexts.get_named_context(name))
      .filter(Boolean)
    ;
  }
  /**
   * @param {string} target_path
   */
  remove_by_path(target_path, params = {}) {
    const norm_key = target_path.endsWith('/') ? target_path.slice(0, -1) : target_path;
    const remove_keys = Object.entries(this.data?.context_items || {})
      .filter(([key, data]) => (
        key === norm_key
        || key.startsWith(norm_key + '/'))
        || key.startsWith(norm_key + '#')
      )
      .map(([key]) => key)
    ;
    remove_keys.forEach((key) => {
      delete this.data.context_items[key];
    });
    if(!remove_keys.length) {
      // IF REMOVED FROM NAMED CONTEXT, THEN PROMOTE ALL ITEMS IN NAMED CONTEXT TO ROOT LEVEL (EXCEPT THE REMOVED ITEM)
      const included_in_named_context = this.named_contexts.find((ctx) => Object.entries(ctx.data?.context_items || {}).some(([key]) => key.startsWith(target_path)));
      if(included_in_named_context) {
        delete this.data.context_items[included_in_named_context.data.name];
        const replace_with_items = Object.entries(included_in_named_context.data?.context_items || {}).filter(([key]) => !key.startsWith(target_path));
        replace_with_items.forEach(([key, item_data]) => {
          this.data.context_items[key] = item_data;
        });
      }
    }

    this.emit_event('context:updated', {
      removed_key: target_path,
      ...(params.folder ? { folder: true } : {}),
    });

    this.queue_save();

  }

  /**
   * add_item
   * this override adds implementation-specific (source/block pattern) logic to remove redundant block items when a parent source is added
   * @param {string|object} item
   */
  add_item(item, params = {}) {
    const {
      emit_updated = true,
    } = params;
    let key;
    if (typeof item === 'object') {
      key = item.key || item.path;
    } else {
      key = item;
    }
    const existing = this.data.context_items[key];
    const context_item = {
      d: 0,
      at: Date.now(),
      ...(existing || {}),
      ...(typeof item === 'object' ? item : {}),
    };
    if (!key) return console.error('SmartContext: add_item called with invalid item', item);
    const emit_payload = { add_item: key };
    const remove_sub_keys = Object.entries(this.data.context_items)
      .filter(([existing_key]) => existing_key !== key && existing_key.startsWith(key))
      .map(([existing_key]) => existing_key)
    ;
    if (remove_sub_keys.length) {
      this.remove_items(remove_sub_keys, { emit_updated: false });
      emit_payload.removed_keys = remove_sub_keys;
      emit_payload.message = 'Parent item added, removed redundant sub-items';
    }
    this.data.context_items[key] = context_item;
    this.queue_save();
    if (emit_updated) this.emit_event('context:updated', emit_payload);
  }
}
