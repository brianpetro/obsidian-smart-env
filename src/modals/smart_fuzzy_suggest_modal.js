import {
  FuzzySuggestModal,
  Keymap,
  setIcon,
  Platform
} from 'obsidian';

import {
  build_suggest_scope_items,
  should_handle_arrow_left
 } from '../utils/smart_fuzzy_suggest_utils.js';

/**
 * Base smart fuzzy suggest modal with registration helpers.
 * Subclasses can override the static getters to customize command/event IDs.
 */
export class SmartFuzzySuggestModal extends FuzzySuggestModal {
  constructor(item_or_collection) {
    const env = item_or_collection.env;
    const plugin = env.plugin;
    const app = plugin.app;
    super(app);
    this.app = app;
    env.create_env_getter(this);
    this.plugin = plugin;
    this.item_or_collection = item_or_collection;
    this.emptyStateText = 'No suggestions available';
    this._set_custom_instructions = false;
  }


  /** Unique type key for this modal class. Subclasses override. */
  static get modal_type() { return 'smart-fuzzy-suggest'; }

  /** Human label used in commands. Subclasses override as needed. */
  static get display_text() { return 'Smart Fuzzy Suggest'; }

  /** Event name listened to on env.events to open this modal. */
  static get event_domain() { return `${this.modal_type}`; }

  /** Command id used with addCommand. */
  static get command_id() { return this.modal_type; }

  static open(item_or_collection, params) {
    const Modal = /** @type {typeof SmartFuzzySuggestModal} */ (this);
    const modal = new Modal(item_or_collection, params);
    modal.open(params);
    return modal;
  }

  static register_modal(plugin) {
    const Modal = /** @type {typeof SmartFuzzySuggestModal} */ (this);
    const env = plugin?.env;
    const modal_config = {
      ...(env.config.modals?.[this.modal_key] || {}),
      class: null,
    }
    console.log(`Registering modal: ${this.display_text}`, {modal_config, Modal});

    const open_handler = (payload = {}) => {
      const item = Modal.resolve_item_from_payload(env, payload);
      const modal = Modal.open(item, {
        ...modal_config,
        ...payload // spread since event payload is locked
      });
      return modal;
    };
    // const suggest_handler = async (payload = {}) => {
    //   if(!payload.suggest) return console.warn('No suggest payload provided for suggest event');
    //   const modal = open_handler(payload);
    //   const item = this.resolve_item_from_payload(env, payload.suggest);
    //   if(!item) return console.warn('No item found for suggest payload', payload.suggest);
    //   const suggest_action_key = payload.suggest.action_key;
    //   if(!suggest_action_key) return console.warn('No action_key provided in suggest payload', payload.suggest);
    //   const suggestions = await item?.actions?.[suggest_action_key]?.();
    //   if(!suggestions?.length) return console.warn('No suggestions returned for suggest action', suggest_action_key, 'on item', item);
    //   modal.suggestions = suggestions;
    //   modal.updateSuggestions();
    // };
    const disposers = [
      env?.events?.on?.(`${Modal.event_domain}:open`, open_handler),
      // env.events?.on?.(`${Modal.event_domain}:suggest`, suggest_handler),
    ];
    const dispose_all = () => {
      disposers.forEach(dispose => typeof dispose === 'function' && dispose());
    };
    if (typeof plugin.register === 'function') {
      plugin.register(() => dispose_all());
    }

    return {
      event_domain: Modal.event_domain
    };
  }

  static resolve_item_from_payload(env, payload) {
    const item = env?.[payload.collection_key]?.items?.[payload.item_key];
    return item;
  }

  setInstructions(instructions, is_custom = true) {
    this._set_custom_instructions = is_custom;
    super.setInstructions(instructions);
  }

  set_default_instructions() {
    this.setInstructions([
      { command: 'Enter', purpose: 'Select' }
    ], false);
  }

  open(params = {}) {
    super.open();
    this.modalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) this.use_shift_select = true;
        this.selectActiveSuggestion(e);
      }
      const is_cursor_end_of_input = this.inputEl.selectionStart === this.inputEl.value.length;
      const should_handle_arrow_right = is_cursor_end_of_input
        || e.target !== this.inputEl
        || !this.inputEl.value;
      const should_handle_arrow_left_action = should_handle_arrow_left(this, {
        event_target: e.target,
        input_value: this.inputEl.value,
      });
      // console.log({is_cursor_end_of_input, inputEl: this.inputEl});
      if (e.key === 'ArrowLeft' && should_handle_arrow_left_action) {
        this.use_arrow_left = true;
        this.selectActiveSuggestion(e);
        return;
      }
      if (e.key === 'ArrowRight' && should_handle_arrow_right) {
        e.preventDefault();
        this.use_mod_select = true;
        this.use_arrow_right = true;
        this.selectActiveSuggestion(e);
        return;
      }
    });
  }

  getItems() {
    return this.get_suggestions();
  }

  getItemText(suggestion_item) {
    return suggestion_item.display;
  }

  filter_suggestions(suggestions) {
    return suggestions; // PLACEHOLDER for subclasses
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
    return [];
  }
  get_suggest_scopes() {
    return build_suggest_scope_items(this, {
      action_keys: this.default_suggest_action_keys,
    });
  }

  async update_suggestions(suggest_ref) {
    if(typeof suggest_ref === 'string') {
      suggest_ref = this.item_or_collection.actions[suggest_ref];
    }
    if (typeof suggest_ref === 'function') {
      this._set_custom_instructions = false;
      const result = await suggest_ref({modal: this});
      console.log('Suggestion action result', result);
      if(Array.isArray(result) && result.length) {
        this.suggestions = result;
      }
    } else if (Array.isArray(suggest_ref)) {
      this.suggestions = suggest_ref;
    }
    if(Array.isArray(this.suggestions) && this.suggestions.length) {
      this.updateSuggestions();
    } else {
      this.env.events.emit('notification:error', {message: 'Invalid suggestion action'});
      console.warn('Invalid suggestion action', suggest_ref);
    }
    if(!this._set_custom_instructions) {
      this.set_default_instructions();
    }
  }
  get default_suggest_action_keys() {
    if (Array.isArray(this.params?.default_suggest_action_keys)) {
      return this.params.default_suggest_action_keys;
    }
    return this.env.config.modals[this.modal_key]?.default_suggest_action_keys || [];
  }
  renderSuggestion(sug, el) {
    super.renderSuggestion(sug, el);
    if (sug.item.icon) {
      el.addClass('sc-modal-suggestion-has-icon');
      const icon_el = el.createEl('span');
      setIcon(icon_el, sug.item.icon);
    }
    return el;
  }
  onChooseSuggestion(selected, evt, ...other) {
    this.prevent_close = true;
    const suggestion = selected.item;
    const is_arrow_left = this.use_arrow_left;
    const is_arrow_right = this.use_arrow_right;
    const is_shift_select = evt?.shiftKey || this.use_shift_select;
    const is_mod_select = Keymap.isModifier(evt, 'Mod')
      || this.use_mod_select
    ;
    // reset flags
    this.use_arrow_right = false;
    this.use_mod_select = false;
    this.use_arrow_left = false;
    this.use_shift_select = false;
    if (is_arrow_left) {
      if (typeof suggestion.arrow_left_action === 'function') {
        this.handle_choose_action(suggestion, 'arrow_left_action');
      } else {
        if(this.last_input_value) {
          this.inputEl.value = this.last_input_value;
          // set cursor to end (timeout ensures after final character)
          setTimeout(() => {
            const len = this.inputEl.value.length;
            this.inputEl.setSelectionRange(len, len);
          }, 0);
          this.last_input_value = null;
        }
        this.suggestions = null;
        this.params.default_suggest_action_keys = null; // reset to config default
        this.updateSuggestions();
        return; // resets suggestions
      }
    } else if (is_arrow_right && typeof suggestion.arrow_right_action === 'function') {
      this.handle_choose_action(suggestion, 'arrow_right_action');
    } else if (is_mod_select && typeof suggestion.mod_select_action === 'function') {
      this.handle_choose_action(suggestion, 'mod_select_action');
    } else if (is_shift_select && typeof suggestion.shift_select_action === 'function') {
      this.handle_choose_action(suggestion, 'shift_select_action');
    } else if(typeof suggestion.select_action === 'function') {
      this.handle_choose_action(suggestion, 'select_action');
    } else {
      this.env.events.emit('notification:warning', {selection_display: suggestion.display, message: 'No action defined for this suggestion'});
    }
  }

  async handle_choose_action(suggestion, action_key) {
    let chosen_action = suggestion[action_key];
    const result = await chosen_action({modal: this});
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
  close() {
    // timeout otherwise close runs before onChooseSuggestion
    setTimeout(() => {
      if(!this.prevent_close) super.close();
      this.prevent_close = false;
    }, 10);
  }
  onClose() {
    this.item_or_collection.emit_event(`${this.constructor.event_domain}:closed`);
  }
}
