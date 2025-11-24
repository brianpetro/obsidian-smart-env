import { FuzzySuggestModal } from 'obsidian';
import { add_exclusion, ensure_smart_sources_settings, parse_exclusions_csv, remove_exclusion } from '../utils/exclusions.js';

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

  /**
   * Open the modal with an optional callback invoked after an item is chosen.
   * The current exclusion list is rendered at the top of the modal.
   * @param {Function} [callback]
   */
  open(callback) {
    this.callback = callback;
    super.open();
    this.render_excluded_list();
  }

  /**
   * Return candidate file paths that are not already excluded.
   * @returns {string[]}
   */
  getItems() {
    // Return all file paths from env.fs
    // But filter out ones already in env.settings.smart_sources.file_exclusions
    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    const file_exclusions = parse_exclusions_csv(smart_sources_settings.file_exclusions);

    const candidates = (this.env.smart_sources?.fs?.file_paths || [])
      .filter(path => !file_exclusions.includes(path));

    return candidates;
  }

  getItemText(item) {
    return item; // item is the file path
  }

  /**
   * Handle selecting a file to exclude.
   * @param {string} item
   */
  onChooseItem(item) {
    if (!item) return;
    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    smart_sources_settings.file_exclusions = add_exclusion(smart_sources_settings.file_exclusions, item);

    // Refresh the header list and suggestions so the newly excluded file
    // disappears from the candidates.
    this.render_excluded_list();
    this.updateSuggestions();

    this.callback?.();
  }

  /**
   * Render the current list of excluded files at the top of the modal,
   * with inline remove buttons.
   */
  render_excluded_list() {
    if (!this.modalEl) return;

    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    const excluded_files = parse_exclusions_csv(smart_sources_settings.file_exclusions);

    let header = this.modalEl.querySelector('.sc-excluded-files-header');
    if (!header) {
      header = this.modalEl.createEl('div', { cls: 'sc-excluded-files-header' });
      this.modalEl.prepend(header);
    }

    header.empty();

    const title_el = header.createEl('h3');
    title_el.setText('Excluded files');

    if (!excluded_files.length) {
      const empty_el = header.createEl('p');
      empty_el.setText('No files excluded yet.');
      return;
    }

    const list_el = header.createEl('ul');
    excluded_files.forEach(file_path => {
      const li = list_el.createEl('li', { cls: 'excluded-file-item' });
      li.setText(file_path + '  ');
      const remove_btn = li.createEl('button', {
        text: '(x)',
        cls: 'remove-excluded-file-btn'
      });
      remove_btn.addEventListener('click', () => {
        smart_sources_settings.file_exclusions = remove_exclusion(
          smart_sources_settings.file_exclusions,
          file_path
        );
        this.env.update_exclusions?.();
        this.render_excluded_list();
        this.updateSuggestions();
      });
    });
  }
}
