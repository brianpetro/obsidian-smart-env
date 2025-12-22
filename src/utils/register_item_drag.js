import { parse_item_key_to_wikilink } from "obsidian-smart-env/utils/parse_item_key_to_wikilink.js";

function handle_connection_drag(obsidian_app, item, params, event){
  const drag_manager = obsidian_app.dragManager;
  const link_text = parse_item_key_to_wikilink(item.key);
  const drag_data = drag_manager.dragLink(event, link_text);
  drag_manager.onDragStart(event, drag_data);
  if(params.drag_event_key) {
    item.emit_event(params.drag_event_key);
  } else {
    item.emit_event('connections:drag_result');
  }
}

export function register_item_drag(container, item, params = {}) {
  const env = item.env;
  const app = env.obsidian_app;
  container.setAttribute('draggable', 'true');
  container.addEventListener('dragstart', handle_connection_drag.bind(null, app, item, params))
}