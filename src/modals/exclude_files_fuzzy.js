import { FuzzySuggestModal } from 'obsidian';
import { add_exclusion, ensure_smart_sources_settings, parse_exclusions_csv } from '../utils/exclusions.js';

/**
 * @file exclude_files_fuzzy.js
 * @description An Obsidian FuzzySuggestModal to pick a single file from env.fs.file_paths
 * and add it to env.settings.smart_sources.file_exclusions (CSV).
 */

export class ExcludedFilesFuzzy extends FuzzySuggestModal {
  /**
   * @param {App} app - The Obsidian app
   * @param {Object} env - An environment-like object, must have .settings and .fs.file_paths
   */
  constructor(app, env) {
    super(app);
    this.env = env;
    this.setPlaceholder('Select a file to exclude...');
  }

  open(callback) {
    this.callback = callback;
    super.open();
  }

  getItems() {
    // Return all file paths from env.fs
    // But filter out ones already in env.settings.smart_sources.file_exclusions
    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    const fileExclusions = parse_exclusions_csv(smart_sources_settings.file_exclusions);

    const candidates = (this.env.smart_sources?.fs?.file_paths || [])
      .filter(path => !fileExclusions.includes(path));

    return candidates;
  }

  getItemText(item) {
    return item; // item is the file path
  }

  onChooseItem(item) {
    if (!item) return;
    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    smart_sources_settings.file_exclusions = add_exclusion(smart_sources_settings.file_exclusions, item);
    this.callback?.();
  }
}
