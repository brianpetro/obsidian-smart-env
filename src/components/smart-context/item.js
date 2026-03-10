import styles from './styles.css';
import { copy_to_clipboard } from '../../../utils/copy_to_clipboard.js';
import { Menu } from 'obsidian';
import { context_to_md_tree } from '../../utils/smart-context/to_md_tree.js';

/**
 * @param {Function} callback
 * @returns {void}
 */
const schedule_next_frame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
};

/**
 * @param {Function} render_fn
 * @returns {Function}
 */
const create_render_scheduler = (render_fn) => {
  let render_pending = false;
  return () => {
    if (render_pending) return;
    render_pending = true;
    schedule_next_frame(async () => {
      render_pending = false;
      await render_fn();
    });
  };
};

export function build_html(ctx, opts = {}) {
  return `<div>
    <div class="sc-context-view" data-context-key="${ctx.data.key}">
      <div class="sc-context-view-header">
        <div class="sc-context-actions"></div>
      </div>
      <div class="sc-context-view-body">
        <div class="sc-context-tree"></div>
      </div>
      <div class="sc-context-view-footer">
        <div class="sc-context-meta"></div>
      </div>
    </div>
  </div>`;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 */
export async function render(ctx, opts = {}) {
  const html = build_html(ctx, opts);
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-context-view');
  post_process.call(this, ctx, container, opts);
  return container;
}

export async function post_process(ctx, container, opts = {}) {
  const disposers = [];

  const render_children = async () => {
    const header = container.querySelector('.sc-context-view-header');
    ctx.env.smart_components.render_component('smart_context_actions', ctx, opts).then((actions) => {
      this.empty(header);
      header.appendChild(actions);
    });

    const body = container.querySelector('.sc-context-view-body');
    ctx.env.smart_components.render_component('smart_context_tree', ctx, opts).then((tree) => {
      this.empty(body);
      body.appendChild(tree);
    });

    const footer = container.querySelector('.sc-context-view-footer');
    ctx.env.smart_components.render_component('smart_context_meta', ctx, opts).then((meta) => {
      this.empty(footer);
      footer.appendChild(meta);
    });
  };
  const schedule_render_children = create_render_scheduler(render_children);
  
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
        console.log({container});
        const md = context_to_md_tree(ctx);
        await copy_to_clipboard(md);
      })
    );
    menu.showAtMouseEvent(ev);
  });

  await render_children();
  disposers.push(ctx.on_event('context:updated', schedule_render_children));
  this.attach_disposer(container, disposers);
  return container;
}