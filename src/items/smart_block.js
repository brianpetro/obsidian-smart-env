import { SmartBlock as BaseClass } from 'smart-blocks/smart_block.js';
import { get_block_display_name } from '../utils/get_block_display_name.js';

export class SmartBlock extends BaseClass {
  /**
   * @param {Object} params - Parameters for display settings
   * @param {boolean} params.show_full_path
   */
  get_display_name(params = {}) {
    // 2026-03-27: this settings object is probably wrong, needs eval
    // likely merge/spread of possible settings targets (or decided to focus on params arg)
    const display_settings = {
      ...(this.env?.settings?.smart_view_filter || {}), // DEPRECATED? settings scope
      ...params
    };
    return get_block_display_name(this, display_settings);
  }

  // DEPRECATED
  /**
   * @deprecated avoid view-logic in Collection/Item AND prefix display_ where used anyway
   */
  get name() {
    return this.get_display_name();
  }
}
