import styles from './styles.css';
import { Menu } from 'obsidian';
import { create_render_scheduler } from '../../utils/render_utils.js';
import { build_context_actions_menu } from '../../utils/smart-context/copy_actions.js';

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
        <div class="sc-context-exclusions"></div>
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
    const component_renderers = [
      ctx.env.smart_components.render_component('smart_context_actions', ctx, opts),
      ctx.env.smart_components.render_component('smart_context_tree', ctx, opts),
    ];
    if (ctx.env._config.components.smart_context_exclusions_list) {
      component_renderers.push(ctx.env.smart_components.render_component('smart_context_exclusions_list', ctx, opts));
    }
    const [actions, tree, exclusions] = await Promise.all(component_renderers);

    const header = container.querySelector('.sc-context-view-header');
    this.empty(header);
    if (actions) header.appendChild(actions);

    const body = container.querySelector('.sc-context-view-body');
    this.empty(body);
    if (tree) body.appendChild(tree);

    const footer = container.querySelector('.sc-context-view-footer');
    this.empty(footer);
    if (exclusions) footer.appendChild(exclusions);

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
    build_context_actions_menu(ctx, menu, opts);
    menu.showAtMouseEvent(ev);
  });

  await render_children();
  disposers.push(ctx.on_event('context:updated', schedule_render_children));
  this.attach_disposer(container, disposers);
  return container;
}

