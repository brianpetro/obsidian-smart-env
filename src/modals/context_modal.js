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
    const suggestions = this.get_suggestions();
    const filtered_suggestions = suggestions.filter(
      (s) => (s.key && !this.smart_context?.data?.context_items[s.key]) || s.select_action
    );
    return filtered_suggestions;
  }

  get_suggestions() {
    if(this.params.suggestions_action_key) {
      const suggestion_action = this.smart_context.actions[this.params.suggestions_action_key];
      if(typeof suggestion_action === 'function') {
        this.suggestions = suggestion_action(this.params);
      }else{
        console.warn('missing suggest action', this.params.suggestions_action_key)
      }
      this.params.suggestions_action_key = null; // only run once
    }
    if(this.suggestions?.length) return this.suggestions;
    if(this.default_suggest_action_keys?.length) {
      // run suggest actions directly if only one default action
      if(this.default_suggest_action_keys.length === 1) {
        this.handle_choose_action(this.default_suggest_action_keys[0]);
        return [];
      }
      return this.get_suggest_scopes()
      ;
    }
    return this.smart_context.actions.context_suggest_sources(this.params);
  }
  get_suggest_scopes() {
    return this.default_suggest_action_keys
      .map(action_key => {
        const action_config = this.env.config.actions[action_key];
        if (!action_config) return null;
        const display_name = action_config.display_name || action_key;
        return {
          select_action: () => {
            this.handle_choose_action(action_key);
          },
          key: action_key,
          display: display_name,
        };
      })
      .filter(Boolean)
    ;
  }

  get default_suggest_action_keys() {
    return this.env.config.modals.context_modal.default_suggest_action_keys || [];
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
    if(typeof suggestion_action === 'string') {
      suggestion_action = this.smart_context.actions[suggestion_action];
    }
    if (typeof suggestion_action !== 'function') {
      this.env.events.emit('notification:error', {message: 'Invalid suggestion action'});
      console.warn('Invalid suggestion action', suggestion_action);
      return;
    }
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
