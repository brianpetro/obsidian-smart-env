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
          this.use_arrow_left = true;
          this.selectActiveSuggestion(e);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.use_mod_select = true;
          this.use_arrow_right = true;
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
    return this.get_suggestions();
  }

  filter_suggestions(suggestions) {
    return suggestions.filter((s) => {
      if (s.key && this.smart_context?.data?.context_items[s.key]) return false;
      return true;
    });
  }

  get_suggestions() {
    if(this.suggestions?.length) {
      this.suggestions = this.filter_suggestions(this.suggestions);
      if(this.suggestions.length > 0) {
        return this.suggestions;
      }
    }
    if(this.default_suggest_action_keys?.length) {
      // run suggest actions directly if only one default action
      if(this.default_suggest_action_keys.length === 1) {
        this.update_suggestions(this.default_suggest_action_keys[0]);
        return [];
      }
      return this.get_suggest_scopes();
    }
    // can below be removed since default_suggest_action_keys?
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
            this.update_suggestions(action_key);
          },
          key: action_key,
          display: display_name,
        };
      })
      .filter(Boolean)
    ;
  }
  get default_suggest_action_keys() {
    if (Array.isArray(this.params?.default_suggest_action_keys)) {
      return this.params.default_suggest_action_keys;
    }
    return this.env.config.modals.context_modal.default_suggest_action_keys || [];
  }

  onChooseSuggestion(selected, evt, ...other) {
    console.log('Chosen suggestion', selected, evt, other);
    this.prevent_close = true;
    const suggestion = selected.item;
    const is_arrow_left = this.use_arrow_left;
    const is_arrow_right = this.use_arrow_right;
    const is_mod_select = Keymap.isModifier(evt, 'Mod')
      || this.use_mod_select
    ;
    // reset flags
    this.use_arrow_right = false;
    this.use_mod_select = false;
    this.use_arrow_left = false;
    if (is_arrow_left) {
      if (typeof suggestion.arrow_left_action === 'function') {
        this.handle_choose_action(suggestion, 'arrow_left_action');
      } else {
        this.suggestions = null;
        this.params.default_suggest_action_keys = null; // reset to config default
        this.updateSuggestions();
        return; // resets suggestions
      }
    } else if (is_arrow_right && typeof suggestion.arrow_right_action === 'function') {
      this.handle_choose_action(suggestion, 'arrow_right_action');
    } else if (is_mod_select && typeof suggestion.mod_select_action === 'function') {
      console.log('Mod key held for suggestion', suggestion);
      this.handle_choose_action(suggestion, 'mod_select_action');
    } else if(typeof suggestion.select_action === 'function') {
      this.handle_choose_action(suggestion, 'select_action');
    } else {
      this.env.events.emit('notification:warning', {selection_display: suggestion.display, message: 'No action defined for this suggestion'});
    }
  }

  async handle_choose_action(suggestion, action_key) {
    let chosen_action = suggestion[action_key];
    const result = await chosen_action({context_modal: this});
    if(Array.isArray(result) && result.length) {
      this.suggestions = result;
    } else if (Array.isArray(result)) {
      this.env.events.emit('notification:info', {message: 'No suggestions returned from action'});
    }
    const idx = this.chooser.values.findIndex(i => i.item?.display === suggestion.display);
    setTimeout(() => {
      this.updateSuggestions();
      if(idx !== -1) {
        this.chooser.setSelectedItem(idx);
      }
    }, 100);
  }
  async update_suggestions(context_suggest) {
    if(typeof context_suggest === 'string') {
      context_suggest = this.smart_context.actions[context_suggest];
    }
    if (typeof context_suggest === 'function') {
      const result = await context_suggest({context_modal: this});
      console.log('Suggestion action result', result);
      if(Array.isArray(result) && result.length) {
        this.suggestions = result;
      }
    } else if (Array.isArray(context_suggest)) {
      this.suggestions = context_suggest;
    }
    if(Array.isArray(this.suggestions) && this.suggestions.length) {
      this.updateSuggestions();
    } else {
      this.env.events.emit('notification:error', {message: 'Invalid suggestion action'});
      console.warn('Invalid suggestion action', context_suggest);
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
