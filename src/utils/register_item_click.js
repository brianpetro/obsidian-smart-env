import { open_source } from "obsidian-smart-env/src/utils/open_source.js";

export function register_item_click(container, item) {
  container.addEventListener('click', (event) => {
    event.stopPropagation();
    open_source(item, event);
    item.emit_event('connections_result:click');
  });
}