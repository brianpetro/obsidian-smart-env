import { ExcludedSourcesModal } from '../../modals/excluded_sources.js';

export async function build_html(env, opts = {}) {
  return `
      <div class="setting-component">
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
  `;
}

export async function render(env, opts = {}) {
  const html = await build_html.call(this, env, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, env, container, opts);
  return container;
}

async function post_process(env, container, opts = {}) {
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

