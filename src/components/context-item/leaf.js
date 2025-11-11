function build_html(context_item, params={}) {
  return `<span>
  <span class="sc-context-item-remove" data-path="${context_item.key}">×</span>
  <span class="sc-context-item-leaf">${context_item.key}</span>
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
}