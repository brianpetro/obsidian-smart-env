import { copy_to_clipboard } from 'obsidian-smart-env/utils/copy_to_clipboard.js';
export function build_html(ctx, opts = {}) {
  return `<div>
    <div class="sc-context-view" data-context-key="${ctx.data.key}">
      <div class="sc-context-view-header">
        <div class="sc-context-view-actions"></div>
      </div>
      <div class="sc-context-view-body">
        <div class="sc-context-view-tree"></div>
      </div>
      <div class="sc-context-view-footer">
        <div class="sc-context-view-meta"></div>
      </div>
    </div>
  </div>`;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 */
export async function render(ctx, opts = {}) {
  const html = build_html(ctx, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-context-view');
  post_process.call(this, ctx, container, opts);
  return container;
}

export async function post_process(ctx, container, opts = {}) {
  const disposers = [];
  const actions_el = container.querySelector('.sc-context-view-actions');
  const tree_el    = container.querySelector('.sc-context-view-tree');
  const meta_el    = container.querySelector('.sc-context-view-meta');

  const render_children = async () => {
    const actions = await ctx.env.render_component('smart_context_actions', ctx, opts);
    this.empty(actions_el);
    actions_el.appendChild(actions);

    const tree = await ctx.env.render_component('smart_context_tree', ctx, opts);
    this.empty(tree_el);
    tree_el.appendChild(tree);

    const meta = await ctx.env.render_component('smart_context_meta', ctx, opts);
    this.empty(meta_el);
    meta_el.appendChild(meta);
  };
  
  const plugin = ctx.env.plugin;
  const app = plugin?.app || window.app;
  const register = plugin?.registerDomEvent?.bind(plugin) || ((el, evt, cb) => el.addEventListener(evt, cb));
  register(container, 'contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!app) return;
    const menu = new Menu(app);
    menu.addItem((mi) =>
      mi.setTitle('Copy link tree').setIcon('copy').onClick(async () => {
        const md = tree_dom_to_wikilinks(container);
        await copy_to_clipboard(md);
      })
    );
    menu.showAtMouseEvent(ev);
  });

  await render_children();
  disposers.push(ctx.on_event('context:updated', render_children));
  this.attach_disposer(container, disposers);
  return container;
}
// Prob replace with using ctx.data.context_items keys
function tree_dom_to_wikilinks(container) {
  const lines = [];
  const walk = (li, depth) => {
    const path = li.dataset.path;
    if (!path) return;
    // Remove external/selection prefixes
    let rel = path.replace(/^external:/, '').replace(/^selection:/, '');
    const label = li.querySelector(':scope > .sc-tree-label')?.textContent?.trim() || '';
    if (li.classList.contains('file')) {
      // Only use the filename without extension for wikilinks
      let file = rel.split('/').pop().replace(/\.md$/, '');
      lines.push(`${'\t'.repeat(depth)}- [[${file}]]`);
    } else if (li.classList.contains('dir')) {
      // Use the label for directories (not a wikilink)
      lines.push(`${'\t'.repeat(depth)}- ${label}`);
    }
    li.querySelectorAll(':scope > ul > li').forEach(child => walk(child, depth + 1));
  };
  container.querySelectorAll(':scope > ul > li').forEach(li => walk(li, 0));
  return lines.join('\n');
}

