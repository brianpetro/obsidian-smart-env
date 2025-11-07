import {SmartFuzzySuggestModal} from "./smart_fuzzy_suggest_modal.js";
import { Keymap, Platform } from 'obsidian';

export class ContextModal extends SmartFuzzySuggestModal {
  /** Modal identity */
  static get modal_type()     { return 'context_selector'; }
  static get display_text()   { return 'Context Selector'; }
  static get event_domain()     { return 'context_selector'; }
  static get command_id()     { return this.modal_type; }


  constructor(smart_context, params={}) {
    super(smart_context);
    this.params = params;
    this.smart_context = smart_context;
    // this.shouldRestoreSelection = true; // does nothing?
    this.emptyStateText = 'No suggestions available';
    this.setInstructions([
      { command: 'Enter', purpose: 'Add to context' },
      { command: `→ / ←`, purpose: 'Toggle block view' },
      { command: 'Esc', purpose: 'Close' },
    ]);
  }
  open(params={}) {
    super.open();
    this.render(params);
    this.modalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.selectActiveSuggestion(e);
      if (e.target !== this.inputEl || !this.inputEl.value || Keymap.isModEvent(e)) {
        if (e.key === 'ArrowLeft') {
          this.suggestions = null;
          this.updateSuggestions();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.use_mod_select = true;
          this.selectActiveSuggestion(e);
          return;
        }
      }
    });
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

  getItems() {
    const suggestions = this.suggestions?.length
      ? this.suggestions
      : this.smart_context.actions.context_suggest_sources(this.params)
    ;
    const filtered_suggestions = suggestions.filter(
      (s) => (s.key && !this.smart_context?.data?.context_items[s.key]) || s.select_action
    );
    return filtered_suggestions;
  }

  onChooseSuggestion(selected, evt) {
    this.prevent_close = true;
    const suggestion = selected.item;
    if (Keymap.isModifier(evt, 'Mod') || this.use_mod_select) {
      console.log('Mod key held for suggestion', suggestion);
      this.use_mod_select = false;
      if(typeof suggestion.mod_select_action === 'function') {
        this.handle_choose_action(suggestion.mod_select_action);
      }
    } else {
      if(typeof suggestion.select_action === 'function') {
        this.handle_choose_action(suggestion.select_action);
      } else {
        this.smart_context.add_item(suggestion.key);
        setTimeout(() => {
          this.updateSuggestions();
        }, 100);
      }
    }
  }

  async handle_choose_action(suggestion_action) {
    const result = await suggestion_action();
    console.log('Suggestion action result', result);
    if(Array.isArray(result)) {
      this.suggestions = result;
      this.updateSuggestions();
      return;
    } else {
      this.suggestions = null;
    }
  }
  close() {
    // timeout otherwise close runs before onChooseSuggestion
    setTimeout(() => {
      if(!this.prevent_close) super.close();
      this.prevent_close = false;
    }, 10);
  }

}
