import { context_suggest_blocks } from "./blocks.js";
import {
  Platform
} from 'obsidian';
const MOD_CHAR = Platform.isMacOS ? '⌘' : 'Ctrl';

/**
 * @param {string} folder_path
 * @returns {string}
 */
function normalize_folder_path(folder_path) {
  if (typeof folder_path !== 'string') return '';
  return folder_path.replace(/\/+$/g, '');
}

/**
 * @param {string} source_key
 * @param {string} folder_path
 * @returns {boolean}
 */
function is_source_in_folder(source_key, folder_path) {
  const normalized_folder_path = normalize_folder_path(folder_path);
  if (!normalized_folder_path) return true;
  if (source_key === normalized_folder_path) return true;
  return source_key.startsWith(`${normalized_folder_path}/`);
}

/**
 * @param {object} modal
 * @returns {void}
 */
function reset_modal_input(modal) {
  if (!modal?.inputEl) return;
  modal.last_input_value = modal.inputEl.value;
  modal.inputEl.value = '';
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {string} [folder_path]
 * @returns {Array<{ key: string }>}
 */
function get_sources_list(ctx, folder_path) {
  const items = Object.values(ctx.env?.smart_sources?.items || {});
  return items.filter((source) => is_source_in_folder(source.key, folder_path));
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Array<{ key: string }>} sources
 * @returns {Array<{ key: string, display: string, select_action: Function, mod_select_action: Function, arrow_right_action: Function }>}
 */
function build_source_suggestions(ctx, sources) {
  return sources.map((source) => ({
    key: source.key, // DEPRECATED???
    display: source.key,
    select_action: () => {
      ctx.add_item(source.key);
    },
    mod_select_action: ({ modal } = {}) => {
      reset_modal_input(modal);
      // DO: decedied: replace with adding all blocks?
      return context_suggest_blocks.call(ctx, { source_key: source.key, modal });
    },
    arrow_right_action: ({ modal } = {}) => {
      reset_modal_input(modal);
      return context_suggest_blocks.call(ctx, { source_key: source.key, modal });
    }
  }));
}

/**
 * @param {object} [params]
 * @param {string} [params.folder_path]
 * @returns {Array<{ key: string, display: string, select_action: Function, mod_select_action: Function, arrow_right_action: Function }>}
 */
export function context_suggest_sources(params = {}) {
  console.log('context_suggest_sources', params);
  const modal = params?.modal;
  if (modal) {
    modal.setInstructions([
      { command: 'Enter', purpose: 'Add source to context' },
      { command: `${MOD_CHAR} + Enter / →`, purpose: 'Suggest source blocks' },
    ]);
  }
  const sources = get_sources_list(this, params?.folder_path || '');
  return build_source_suggestions(this, sources);
}
export const display_name = 'Add sources';
