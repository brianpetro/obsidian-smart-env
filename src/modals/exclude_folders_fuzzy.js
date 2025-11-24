/**
 * @file excluded_folders_fuzzy.js
 * @description An Obsidian FuzzySuggestModal to pick a single folder from env.fs.folder_paths and add it to env.settings.smart_sources.folder_exclusions (CSV).
 */
import { FuzzySuggestModal } from 'obsidian';
import { add_exclusion, ensure_smart_sources_settings } from '../utils/exclusions.js';

export class ExcludedFoldersFuzzy extends FuzzySuggestModal {
  /**
   * @param {App} app - The Obsidian app
   * @param {Object} env - An environment-like object, must have .settings and .fs.folder_paths
   */
  constructor(app, env) {
    super(app);
    this.env = env;
    this.setPlaceholder('Select a folder to exclude...');
  }

  open(callback) {
    this.callback = callback;
    super.open();
  }

  getItems() {
    // Return all folder paths from env.fs
    return this.env.smart_sources?.fs?.folder_paths || [];
  }

  getItemText(item) {
    return item; // item is the folder path
  }

  onChooseItem(item) {
    if (!item) return;
    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    smart_sources_settings.folder_exclusions = add_exclusion(smart_sources_settings.folder_exclusions, item);

    this.callback?.();
  }
}