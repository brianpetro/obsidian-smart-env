import {SmartFuzzySuggestModal} from "./smart_fuzzy_suggest_modal.js";
import {
  Keymap,
  setIcon,
  Platform
} from 'obsidian';

export class ContextModal extends SmartFuzzySuggestModal {
  /** Modal identity */
  static get modal_type()     { return 'context_selector'; }
  static get display_text()   { return 'Context Selector'; }
  static get event_domain()     { return 'context_selector'; }
  static get command_id()     { return this.modal_type; }
  static get modal_key() { return 'context_selector' }
  get modal_key() { return 'context_selector' }


  constructor(smart_context, params={}) {
    super(smart_context);
    this.params = { ...params };
    this.smart_context = smart_context;
    // this.shouldRestoreSelection = true; // does nothing?
    this.setInstructions([
      { command: 'Enter', purpose: 'Add to context' },
      { command: `→ / ←`, purpose: 'Toggle block view' },
      { command: 'Esc', purpose: 'Close' },
    ]);
  }
  open(params={}) {
    this.params = { ...this.params, ...params };
    super.open();
    this.render(this.params);
  }

  async render(params=this.params) {
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';
    this.modalEl.style.height = '100%';
    // header: show compact context view (actions + tree + meta)
    this.modalEl.prepend(
      await this.env.smart_components.render_component(
        'smart_context_item',
        this.smart_context,
        params
      )
    );
  }

  filter_suggestions(suggestions) {
    return suggestions.filter((s) => {
      if (s.key && this.smart_context?.data?.context_items[s.key]) return false;
      return true;
    });
  }

}