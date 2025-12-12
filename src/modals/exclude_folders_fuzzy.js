/**
 * @file excluded_folders_fuzzy.js
 * @description An Obsidian FuzzySuggestModal to pick a single folder from env.fs.folder_paths
 * and add it to env.settings.smart_sources.folder_exclusions (CSV).
 */
import { FuzzySuggestModal } from 'obsidian';
import { add_exclusion, ensure_smart_sources_settings, parse_exclusions_csv, remove_exclusion } from '../utils/exclusions.js';

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

  /**
   * Open the modal with an optional callback invoked after an item is chosen.
   * The current exclusion list is rendered at the top of the modal.
   * @param {Function} [selection_callback]
   */
  open(selection_callback) {
    this.callback = selection_callback;
    super.open();
    this.render_excluded_list();
  }

  /**
   * Return candidate folder paths that are not already excluded.
   * @returns {string[]}
   */
  getItems() {
    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    const folder_exclusions = parse_exclusions_csv(smart_sources_settings.folder_exclusions);

    const candidates = (this.env.smart_sources?.fs?.folder_paths || [])
      .filter(path => !folder_exclusions.includes(path));

    return candidates;
  }

  getItemText(item) {
    return item; // item is the folder path
  }

  /**
   * Handle selecting a folder to exclude.
   * @param {string} item
   */
  onChooseItem(item) {
    this.prevent_close = true;
    if (!item) return;
    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    smart_sources_settings.folder_exclusions = add_exclusion(smart_sources_settings.folder_exclusions, item);

    // Refresh header list and suggestions so the newly excluded folder
    // disappears from the candidates.
    this.render_excluded_list();
    this.updateSuggestions();

    this.callback?.();
  }

  /**
   * Render the current list of excluded folders at the top of the modal,
   * with inline remove buttons.
   */
  render_excluded_list() {
    if (!this.modalEl) return;

    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    const excluded_folders = parse_exclusions_csv(smart_sources_settings.folder_exclusions);

    let header = this.modalEl.querySelector('.sc-excluded-folders-header');
    if (!header) {
      header = this.modalEl.createEl('div', { cls: 'sc-excluded-folders-header' });
      this.modalEl.prepend(header);
    }

    header.empty();

    const title_el = header.createEl('h3');
    title_el.setText('Excluded folders');

    if (!excluded_folders.length) {
      const empty_el = header.createEl('p');
      empty_el.setText('No folders excluded yet.');
      return;
    }

    const list_el = header.createEl('ul');
    excluded_folders.forEach(folder_path => {
      const li = list_el.createEl('li', { cls: 'excluded-folder-item' });
      li.setText(folder_path + '  ');
      const remove_btn = li.createEl('button', {
        text: '(x)',
        cls: 'remove-excluded-folder-btn'
      });
      remove_btn.addEventListener('click', () => {
        smart_sources_settings.folder_exclusions = remove_exclusion(
          smart_sources_settings.folder_exclusions,
          folder_path
        );
        this.env.update_exclusions?.();
        this.render_excluded_list();
        this.updateSuggestions();
      });
    });
  }
  close() {
    setTimeout(() => {
      if(!this.prevent_close) super.close();
      this.prevent_close = false;
    }, 10);
  }
}
