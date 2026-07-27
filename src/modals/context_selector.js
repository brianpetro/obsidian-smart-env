// V1 compatibility. Retained for:
// - ../../../smart-templates-obsidian/src/modals/template_context_modal.js
import {SmartFuzzySuggestModal} from "./smart_fuzzy_suggest_modal.js";
import {
  Keymap,
  setIcon,
  Platform
} from 'obsidian';

const suggest_menu_key = 'smart_context:suggest';

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
    this.set_default_instructions();
  }
  set_default_instructions() {
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
    // console.log('Opened context selector modal with params:', {ctx: this, params});
  }

  async render(params=this.params) {
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';
    // this.modalEl.style.height = '100%';
    // header: show compact context view (actions + tree + meta)
    this.modalEl.prepend(
      await this.env.smart_components.render_component(
        'smart_context_item',
        this.smart_context,
        params
      )
    );
  }

  /**
   * Resolve explicitly placed context suggest actions.
   *
   * Placements change only top-level source discovery. The legacy fuzzy-list
   * presentation and nested suggestion behavior stay unchanged.
   *
   * @param {object} [params={}]
   * @returns {Array<object>}
   */
  get_suggest_actions(params = {}) {
    if (typeof this.env?.resolve_menu_actions !== 'function') return [];

    try {
      let actions = this.env.resolve_menu_actions(
        suggest_menu_key,
        this.smart_context,
        {
          modal: this,
          ...params,
        },
      );

      const requested_action_keys = this.params?.default_suggest_action_keys;
      const configured_action_keys = this.env?.config?.modals?.[this.modal_key]
        ?.default_suggest_action_keys
      ;
      if (
        Array.isArray(requested_action_keys)
        && requested_action_keys !== configured_action_keys
      ) {
        actions = actions.filter((action) => {
          return requested_action_keys.includes(action.action_key);
        });
      }

      return actions.filter((action) => {
        return action.disabled !== true && action.menu_only !== true;
      });
    } catch (error) {
      console.error('Context Selector: Failed to resolve suggest actions', error);
      return [];
    }
  }

  /**
   * Use menu placements for top-level source discovery while preserving the
   * existing Context Selector UI.
   *
   * @returns {Array<object>}
   */
  get_suggestions() {
    if (this.suggestions?.length) {
      const suggestions = this.filter_suggestions(this.suggestions);
      if (suggestions.length) return suggestions;
    }

    const suggest_actions = this.get_suggest_actions({
      surface: 'context_selector',
    });
    if (suggest_actions.length === 1) {
      this.run_suggest_action(suggest_actions[0]);
      return [];
    }
    if (suggest_actions.length) {
      return this.get_suggest_scopes(suggest_actions);
    }

    return super.get_suggestions();
  }

  /**
   * Build the unchanged legacy source-scope rows from placed actions.
   *
   * @param {Array<object>|null} [suggest_actions]
   * @returns {Array<object>}
   */
  get_suggest_scopes(suggest_actions = null) {
    if (!Array.isArray(suggest_actions) || !suggest_actions.length) {
      return super.get_suggest_scopes();
    }

    return suggest_actions.map((action) => {
      const action_entry = this.env?.config?.actions?.[action.action_key] || {};
      return {
        key: action.action_key,
        display: action_entry.display_name || action.title || action.action_key,
        select_action: () => {
          const result = this.run_suggest_action(action);
          setTimeout(() => this.inputEl?.focus?.(), 100);
          return result;
        },
      };
    });
  }

  /**
   * Run a placed suggest action through the existing fuzzy-modal update flow.
   *
   * @param {object} action
   * @returns {Promise<unknown>}
   */
  run_suggest_action(action) {
    return this.update_suggestions(({ modal }) => action.run({
      modal,
      event_source: `context_selector.suggest:${action.action_key}`,
    }));
  }

  filter_suggestions(suggestions) {
    return suggestions.filter((s) => {
      if (s.key && this.smart_context?.data?.context_items[s.key]) return false;
      return true;
    });
  }

}