import base from 'smart-contexts';
import { SmartContext } from '../items/smart_context.js';
import { SmartContexts as BaseClass } from 'smart-contexts/smart_contexts.js';

export class SmartContexts extends BaseClass {
  static version = '2.1.0';
  async init() {
    await super.init?.();
    this.register_remove_missing_item_handler();
  }

  register_remove_missing_item_handler() {
    if (this._remove_missing_item_disposer) return;
    this._remove_missing_item_disposer = this.env?.events?.on?.(
      'smart_contexts:remove_missing_item',
      (payload = {}) => this.remove_missing_item(payload),
    );
  }

  /**
   * @param {object} [payload={}]
   * @returns {boolean}
   */
  remove_missing_item(payload = {}) {
    const context_key = String(payload?.item_key || payload?.context_key || '').trim();
    const missing_key = String(payload?.missing_key || '').trim();
    const ctx = context_key ? this.get(context_key) : null;

    if (!ctx || !missing_key) {
      this.emit_warning_event('smart_contexts:remove_missing_item_failed', {
        message: 'Unable to remove missing context item.',
        context_key,
        missing_key,
        event_source: 'smart_contexts.remove_missing_item',
      });
      return false;
    }

    ctx.remove_item(missing_key);
    ctx.emit_event('context:missing_item_removed', {
      level: 'info',
      message: 'Removed missing context item.',
      removed_key: missing_key,
      event_source: 'smart_contexts.remove_missing_item',
    });
    return true;
  }

  unload() {
    this._remove_missing_item_disposer?.();
    this._remove_missing_item_disposer = null;
    return super.unload?.();
  }
}

base.class = SmartContexts;
base.version = SmartContexts.version;
base.item_type = SmartContext;

export default base;
