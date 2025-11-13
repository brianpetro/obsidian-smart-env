import { parse_item_key_to_wikilink } from "obsidian-smart-env/utils/parse_item_key_to_wikilink.js";

function handle_connection_drag(obsidian_app, item, event){
  const drag_manager = obsidian_app.dragManager;
  const link_text = parse_item_key_to_wikilink(item.key);
  const drag_data = drag_manager.dragLink(event, link_text);
  drag_manager.onDragStart(event, drag_data);
  item.emit_event('connections_result:drag');
}

export function register_item_drag(container, item) {
  const env = item.env;
  const app = env.obsidian_app;
  container.setAttribute('draggable', 'true');
  container.addEventListener('dragstart', handle_connection_drag.bind(null, app, item))
}