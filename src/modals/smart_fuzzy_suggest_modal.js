import { FuzzySuggestModal, Keymap } from 'obsidian';

/**
 * @typedef {object} SuggestionItem
 * @property {string} key           key to add to a SmartContext instance
 * @property {string} display       text shown in the modal
 * @property {function} [select_action]     optional action on select
 * @property {function} [mod_select_action] optional action on mod+select
 */

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
    this.env = env;
    this.plugin = plugin;
    this.item_or_collection = item_or_collection;
  }

  /**
   * Subclasses should implement. Return an array of suggestion items.
   * @returns {Array<SuggestionItem>}
   */
  getItems() {}

  getItemText(suggestion_item) {
    return suggestion_item.display;
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

    const open_handler = (payload = {}) => {
      const item = Modal.resolve_item_from_payload(env, payload);
      const modal = Modal.open(env, item, payload);
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
    return env?.[payload.collection_key]?.items?.[payload.item_key];
  }
}
