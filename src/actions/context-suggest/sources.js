import { context_suggest_blocks } from './blocks.js';
import { Platform } from 'obsidian';
import {
  get_sources_list,
  reset_modal_input,
} from '../../utils/smart-context/source_folder_utils.js';

const MOD_CHAR = Platform.isMacOS ? '⌘' : 'Ctrl';
const DEFAULT_SOURCE_FILE_TYPES = new Set(['md', 'base', 'canvas']);

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
 * @param {(source: { file_type: string }) => boolean} [params.source_filter]
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

  const source_filter = params?.source_filter
    || ((source) => DEFAULT_SOURCE_FILE_TYPES.has(source.file_type))
  ;
  const sources = get_sources_list(this, {
    folder_path: params?.folder_path || '',
  }).filter(source_filter);
  return build_source_suggestions(this, sources);
}

export const display_name = 'Add sources';
export const display_description = 'Search Markdown notes, Bases, and Canvas files.';

export const menus = {
  'smart_context:suggest': {
    title: 'Notes',
    icon: 'file-text',
    order: 0,
  },
};
