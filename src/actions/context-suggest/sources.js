import { context_suggest_blocks } from './blocks.js';
import { Platform } from 'obsidian';
import {
  get_sources_list,
  reset_modal_input,
} from './source_folder_utils.js';

const MOD_CHAR = Platform.isMacOS ? '⌘' : 'Ctrl';

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Array<{ key: string }>} sources
 * @returns {Array<{ key: string, display: string, select_action: Function, mod_select_action: Function, arrow_right_action: Function }>}
 */
function build_source_suggestions(ctx, sources) {
  return sources.map((source) => ({
    key: source.key,
    display: source.key,
    select_action: () => {
      ctx.add_item(source.key);
    },
    mod_select_action: ({ modal } = {}) => {
      reset_modal_input(modal);
      return context_suggest_blocks.call(ctx, { source_key: source.key, modal });
    },
    arrow_right_action: ({ modal } = {}) => {
      reset_modal_input(modal);
      return context_suggest_blocks.call(ctx, { source_key: source.key, modal });
    },
  }));
}

/**
 * @param {object} [params]
 * @param {string} [params.folder_path]
 * @returns {Array<{ key: string, display: string, select_action: Function, mod_select_action: Function, arrow_right_action: Function }>}
 */
export function context_suggest_sources(params = {}) {
  const modal = params?.modal;
  if (modal) {
    modal.setInstructions([
      { command: 'Enter', purpose: 'Add source to context' },
      { command: `${MOD_CHAR} + Enter / →`, purpose: 'Suggest source blocks' },
    ]);
  }

  const sources = get_sources_list(this, { folder_path: params?.folder_path || '' });
  return build_source_suggestions(this, sources);
}

export const display_name = 'Add sources';
