export function parse_item_key_to_wikilink(key) {
  if (!key) return '';
  const [file_path, ...parts] = key.split('#');
  const file_name = file_path.split('/').pop().replace(/\.md$/, '');
  if (!parts.length) return `[[${file_name}]]`;
  const heading = parts.filter(part => !part.startsWith('{')).pop();
  if (!heading) return `[[${file_name}]]`;
  return `[[${file_name}#${heading}]]`;
}
