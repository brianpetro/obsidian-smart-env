import styles from './suggest_display_right.css';


export function build_html(display_right, params = {}) {
  return `<span class="sc-modal-suggestion-right" data-sc-display-right="true">${display_right}</span>`;
}

export function render(display_right, params = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html(display_right, params));
  const container = frag.firstElementChild;
  return container;
}