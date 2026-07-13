/**
 * @file excluded_folders_fuzzy.js
 * @description An Obsidian FuzzySuggestModal to pick a single folder from env.fs.folder_paths
 * and add it to env.settings.smart_sources.folder_exclusions_list.
 */
import { FuzzySuggestModal } from 'obsidian';
import {
  add_exclusion,
  ensure_smart_sources_settings,
  format_folder_exclusion,
  remove_exclusion,
} from '../utils/exclusions.js';

export class ExcludedFoldersFuzzy extends FuzzySuggestModal {
  /**
   * @param {App} app - The Obsidian app
   * @param {Object} env - An environment-like object, must have .settings and .fs.folder_paths
   */
  constructor(app, env) {
    super(app);
    this.env = env;
    this.setPlaceholder('Select a folder or type an exclusion pattern...');
    this.setInstructions([
      { command: 'Enter', purpose: 'Exclude selected folder' },
      { command: 'Shift + Enter', purpose: 'Add entered pattern directly' },
      { command: 'Esc', purpose: 'Close' },
    ]);
    this.scope.register(['Shift'], 'Enter', (evt) => {
      this.use_input_value = true;
      this.onChooseItem(this.inputEl.value, evt);
      return false;
    });
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
    const folder_exclusions = smart_sources_settings.folder_exclusions_list
      .map(format_folder_exclusion)
    ;

    const candidates = (this.env.smart_sources?.fs?.folder_paths || [])
      .filter(path => !folder_exclusions.includes(format_folder_exclusion(path)));

    return candidates;
  }

  getItemText(item) {
    return item; // item is the folder path
  }

  /**
   * Handle selecting a folder to exclude.
   * Shift-select inserts the current input directly; normal select stores the
   * selected folder as a recursive pattern ending in `/**`.
   * @param {string} item
   * @param {KeyboardEvent|MouseEvent} [evt]
   */
  onChooseItem(item, evt) {
    const use_input_value = this.use_input_value || evt?.shiftKey;
    this.use_input_value = false;

    const exclusion = use_input_value
      ? this.inputEl.value.trim()
      : format_folder_exclusion(item)
    ;
    if (!exclusion) return;

    this.prevent_close = true;
    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    smart_sources_settings.folder_exclusions_list = add_exclusion(
      smart_sources_settings.folder_exclusions_list,
      exclusion,
    );

    // Refresh header list and suggestions so the newly excluded folder
    // disappears from the candidates.
    this.render_excluded_list();
    this.updateSuggestions();

    this.callback?.();
  }

  /**
   * Render excluded folders and folder-like .gitignore patterns in one list.
   * User-managed exclusions include remove buttons; imported patterns show
   * their .gitignore source in the same position.
   */
  render_excluded_list() {
    if (!this.modalEl) return;

    const smart_sources_settings = ensure_smart_sources_settings(this.env);
    const excluded_folders = smart_sources_settings.folder_exclusions_list;
    const gitignore_exclusions = (this.env.settings.gitignore_exclusions || [])
      .filter(pattern => !pattern.includes('.'))
    ;

    let header = this.modalEl.querySelector('.sc-excluded-folders-header');
    if (!header) {
      header = this.modalEl.createEl('div', { cls: 'sc-excluded-folders-header' });
      this.modalEl.prepend(header);
    }

    header.empty();

    const title_el = header.createEl('h3');
    title_el.setText('Excluded folders');

    if (!excluded_folders.length && !gitignore_exclusions.length) {
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
        smart_sources_settings.folder_exclusions_list = remove_exclusion(
          smart_sources_settings.folder_exclusions_list,
          folder_path
        );
        this.env.update_exclusions?.();
        this.render_excluded_list();
        this.updateSuggestions();
      });
    });

    gitignore_exclusions.forEach(pattern => {
      const li = list_el.createEl('li', {
        cls: 'excluded-folder-item gitignore-exclusion-item',
      });
      li.setText(pattern + '  ');
      li.createEl('span', {
        text: '.gitignore',
        cls: 'gitignore-exclusion-source',
        attr: { "aria-label": 'Excluded via .gitignore pattern' },
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
