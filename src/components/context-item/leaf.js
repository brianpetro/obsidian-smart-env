import { register_item_hover_popover } from 'obsidian-smart-env/src/utils/register_item_hover_popover.js';
import { Platform } from 'obsidian';
function build_html(context_item, params={}) {
  let name;
  if(context_item.item_ref) {
    if(context_item.item_ref.key.includes('#')) {
      const name_pcs = context_item.item_ref.key.split('/').pop().split('#').filter(Boolean);
      const last_pc = name_pcs.pop();
      const segments = [];
      if(last_pc && last_pc.startsWith('{')) {
        segments.push(name_pcs.pop());
        segments.push(context_item.item_ref.lines.join('-'));
        name = segments.join(' > Lines: ');
      }
    }else{
      name = context_item.item_ref.key.split('/').pop();
    }
  }else{
    name = context_item.key.split('/').pop();
  }

  return `<span>
  <span class="sc-context-item-remove" data-path="${context_item.key}">×</span>
  <span class="sc-context-item-name">${name || context_item.key}</span>
  </span>`;
}

export async function render(context_item, params={}) {
  const html = build_html(context_item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, context_item, container, params);
  return container;
}

async function post_process(context_item, container, params={}) {
  const env = params.env;
  const remove_btn = container.querySelector('.sc-context-item-remove');
  if (remove_btn) {
    remove_btn.addEventListener('click', () => {
      context_item.ctx.remove_item(context_item.key);
    });
  }
  if(context_item.item_ref) {
    const name = container.querySelector('.sc-context-item-name');
    name.setAttribute('title', `Hold ${Platform.isMacOS ? '⌘' : 'Ctrl'} to preview`);
    register_item_hover_popover(name, context_item.item_ref);
  }
}