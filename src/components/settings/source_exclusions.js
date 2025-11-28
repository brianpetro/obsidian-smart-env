import { ExcludedFoldersFuzzy } from '../../modals/exclude_folders_fuzzy.js';
import { ExcludedSourcesModal } from '../../modals/excluded_sources.js';
import { ExcludedFilesFuzzy } from '../../modals/exclude_files_fuzzy.js';

/**
 * Build the HTML string for environment settings
 * wrapped in .sc-env-settings-container, with a header & toggle button.
 */
export async function build_html(env, opts = {}) {
  // Outer container + heading
  // sc-env-settings-body is hidden/shown by the toggle button
  return `
    <div class="exclusion-settings-container">
      <div class="">
        <div class="setting-item">
          <div class="info setting-item-info">
            <div class="setting-item-name">Excluded folders</div>
            <div class="setting-item-description">Manage folders to exclude from the environment.</div>
          </div>
          <div class="control setting-item-control">
            <button class="sc-add-excluded-folder-btn" type="button">Edit excluded folders</button>
          </div>
        </div>
      </div>

      <div class="">
        <div class="setting-item">
          <div class="info setting-item-info">
            <div class="setting-item-name">Excluded files</div>
            <div class="setting-item-description">Manage files to exclude from the environment.</div>
          </div>
          <div class="control setting-item-control">
            <button class="sc-add-excluded-file-btn" type="button">Edit excluded files</button>
          </div>
        </div>
      </div>

      <div class="">
        <div class="setting-item">
          <div class="info setting-item-info">
            <div class="setting-item-name">Excluded</div>
            <div class="setting-item-description">View all excluded sources.</div>
          </div>
          <div class="control setting-item-control">
            <button class="sc-excluded-sources-btn" type="button">Show all excluded</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render environment settings as a DocumentFragment
 */
export async function render(env, opts = {}) {
  const html = await build_html.call(this, env, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, opts);
  return container;
}

/**
 * Sets up event listeners for toggling, fuzzy modals, etc.
 */
export async function post_process(env, container, opts = {}) {
  // Excluded folders
  const add_folder_btn = container.querySelector('.sc-add-excluded-folder-btn');
  if (add_folder_btn) {
    add_folder_btn.addEventListener('click', () => {
      const fuzzy = new ExcludedFoldersFuzzy(env.main.app, env);
      fuzzy.open(() => {
        env.update_exclusions();
      });
    });
  }

  // Excluded files
  const add_file_btn = container.querySelector('.sc-add-excluded-file-btn');
  if (add_file_btn) {
    add_file_btn.addEventListener('click', () => {
      const fuzzy = new ExcludedFilesFuzzy(env.main.app, env);
      fuzzy.open(() => {
        env.update_exclusions();
      });
    });
  }

  // Show excluded
  const show_excluded_btn = container.querySelector('.sc-excluded-sources-btn');
  if (show_excluded_btn) {
    show_excluded_btn.addEventListener('click', () => {
      const modal = new ExcludedSourcesModal(env.main.app, env);
      modal.open();
    });
  }

  return container;
}

