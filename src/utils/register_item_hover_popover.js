import { register_block_hover_popover } from './register_block_hover_popover.js';
import { Keymap } from 'obsidian';

export function register_item_hover_popover(container, item, params = {}) {
  const app = item.env?.plugin?.app || window.app;
  if (item.key.indexOf('{') === -1) {
    container.addEventListener('mouseover', (event) => {
      const linktext_path = item.key.replace(/#$/, ''); // remove trailing hash if present
      app.workspace.trigger('hover-link', {
        event,
        source: 'smart-connections-view',
        hoverParent: container.parentElement,
        targetEl: container,
        linktext: linktext_path
      });
      if (Keymap.isModEvent(event)) {
        const event_domain = params.event_key_domain || item.collection_key || 'item';
        item.emit_event(`${event_domain}:hover_preview`);
      }
    });
  } else {
    register_block_hover_popover(container.parentElement, container, item.env, item.key);
  }
}
