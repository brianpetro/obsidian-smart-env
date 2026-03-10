// Prob replace with using ctx.data.context_items keys
export function ctx_tree_dom_to_wikilinks(input) {
  const root_container = input?.container || input;
  if (!root_container?.querySelector) return '';

  const tree_root =
    root_container.querySelector('.sc-context-tree > ul') ||
    root_container.querySelector('.sc-context-tree ul') ||
    (root_container.tagName === 'UL' ? root_container : null);

  if (!tree_root) return '';

  const lines = [];

  const get_direct_child_lis = (ul) => {
    return Array.from(ul.children).filter((child) => child.tagName === 'LI');
  };

  const get_direct_child_ul = (li) => {
    return Array.from(li.children).find((child) => child.tagName === 'UL') || null;
  };

  const get_item_label = (li) => {
    const label_el = li.querySelector('.sc-context-item-name');
    return label_el?.textContent?.trim() || '';
  };

  const normalize_path = (path) => {
    return path
      .replace(/^external:/, '')
      .replace(/^selection:/, '');
  };

  const file_to_wikilink = (path, fallback_label) => {
    const basename = path.split('/').pop() || fallback_label || '';
    return basename.replace(/\.[^.]+$/, '');
  };

  const walk = (li, depth) => {
    const path = li.dataset?.path;
    if (!path) return;

    const rel = normalize_path(path);
    const label = get_item_label(li);

    if (li.classList.contains('file')) {
      const file = file_to_wikilink(rel, label);
      lines.push(`${'\t'.repeat(depth)}- [[${file}]]`);
    } else if (li.classList.contains('dir')) {
      lines.push(`${'\t'.repeat(depth)}- ${label}`);
    }

    const child_ul = get_direct_child_ul(li);
    if (!child_ul) return;

    get_direct_child_lis(child_ul).forEach((child) => {
      walk(child, depth + 1);
    });
  };

  get_direct_child_lis(tree_root).forEach((li) => {
    walk(li, 0);
  });

  return lines.join('\n');
}