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
    const item_data = this.data?.context_items?.[target_path];
    if (item_data) {
      delete this.data.context_items[target_path];
    } else {
      const starts_with_items = Object.entries(this.data?.context_items || {}).filter(([key]) => key.startsWith(target_path));
      starts_with_items.forEach(([key]) => {
        delete this.data.context_items[key];
      });
      if(!starts_with_items.length) {
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
    }
    this.emit_event('context:updated', {
      removed_key: target_path,
      ...(params.folder ? { folder: true } : {}),
    });

    this.queue_save();

  }
}
