import { render_settings_config } from '../../utils/render_settings_config.js';
import { create_reset_confirm_ui } from './reset_confirm.js';
import { ExcludedFoldersFuzzy } from '../../modals/exclude_folders_fuzzy.js';
import { ExcludedSourcesModal } from '../../modals/excluded_sources.js';
export async function build_html(env, opts = {}) {
  return `
    <div class="sources-settings">
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
  const settings_config = {
    folder_exclusions,
    view_exclusions,
    // reset_env_settings_btn, // TODO: manually tested before implementing reset button
    re_import_sources,
  };
  render_settings_config(settings_config, env, container, {
    default_group_name: 'Sources',
    heading_btn: {
      btn_icon: 'help-circle',
      callback: (event, setting) => {
        window.open('https://smartconnections.app/smart-environment/settings/?utm_source=source-settings', '_external');
      },
    },
  });
  const disposers = [];
  disposers.push(env.events?.on('model:changed', highlight_reset_data(env, container)));
  this.attach_disposer(container, disposers);
  return container;
}


export function highlight_reset_data(env, container) {
  return async (payload) => {
    if (payload.collection_key !== 'embedding_models') return;
    const re_import_setting = container.querySelector('.re-import-sources');
    // add notice to re-import sources to update embeddings
    re_import_setting.classList.add('env-setting-highlight');
    const notice = re_import_setting.querySelector('.reimport-notice')
      ? re_import_setting.querySelector('.reimport-notice')
      : re_import_setting.createEl('div', { cls: 'reimport-notice env-setting-note' })
    ;
    notice.textContent = 'Embedding model changed. Please re-import your sources to update their embeddings.';
    re_import_setting.appendChild(notice);
    env.events.once('sources:reimported', () => {
      re_import_setting.classList.remove('env-setting-highlight');
      notice.remove();
    });
  };
}

export const folder_exclusions = {
  type: 'button',
  name: 'Manage excluded folders',
  description: 'Manage the list of folders excluded from processing.',
  btn_text: 'Manage folders',
  callback: async function (value, setting) {
    const env = this; // scope passed as 'this'
    const fuzzy = new ExcludedFoldersFuzzy(env.main.app, env);
    const selection_callback = () => {
      env.update_exclusions();
    };
    fuzzy.open(selection_callback);
  }
};

export const view_exclusions = {
  type: 'button',
  name: 'View all exclusions',
  description: 'View all excluded sources.',
  btn_text: 'Show',
  callback: async function (value, setting) {
    const env = this; // scope passed as 'this'
    const modal = new ExcludedSourcesModal(env.main.app, env);
    modal.open();
  }
};

export const re_import_sources = {
  type: 'button',
  name: 'Reset data',
  description: 'Clear sources data and re-import.',
  btn_text: 'Re-import sources',
  callback: async function (value, setting) {
    const env = this; // scope passed as 'this'
    const container = setting.controlEl;
    // confirmation row
    const confirm_row = container.createEl('div', { cls: 'sc-inline-confirm-row' });
    const reimport_btn = container.querySelector('button');
    reimport_btn.style.display = 'none';
    confirm_row.setText('Are you sure you want to clear all sources data? This cannot be undone.');
    let confirm_cancel = confirm_row.createEl('button', { text: 'Cancel' });
    let confirm_yes = confirm_row.createEl('button', { text: 'Re-import', cls: 'mod-warning' });
    confirm_yes.addEventListener('click', async (e) => {
      confirm_cancel.style.display = 'none';
      confirm_yes.textContent = 'Re-importing...';
      confirm_yes.disabled = true;
      const confirm_row = e.target.closest('.sc-inline-confirm-row');
      await env.smart_sources.run_clear_all();
      const start = Date.now();
      env.smart_sources.unload();
      env.smart_blocks.unload();
      await env.init_collections();
      await env.load_collections();
      await env.smart_sources.process_embed_queue();
      const end = Date.now();
      env.events?.emit('sources:reimported', { time_ms: end - start });
      env.main.notices?.show('reload_sources', { time_ms: end - start });
      confirm_row.style.display = 'none';
      reimport_btn.style.display = 'inline-block';
      confirm_yes.textContent = 'Yes';
      confirm_yes.disabled = false;
    });
    confirm_cancel.addEventListener('click', (e) => {
      confirm_row.style.display = 'none';
      reimport_btn.style.display = 'inline-block';
    }, { once: true });
  }
};

export const reset_env_settings_btn = {
  type: 'button',
  name: 'Reset Smart Env settings',
  description: 'Restore Smart Environment settings to defaults.',
  btn_text: 'Reset settings',
  callback: async function (value, setting) {
    const env = this; // scope passed as 'this'
    const container = setting.controlEl;
    create_reset_confirm_ui(env, { container });
  }
};
