import { ExcludedFoldersFuzzy } from '../../modals/exclude_folders_fuzzy.js';

export async function build_html(env, opts = {}) {
  return `
      <div class="setting-component">
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
  `;
}

export async function render(env, opts = {}) {
  const html = await build_html.call(this, env, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, opts);
  return container;
}

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

  return container;
}

