import { register_block_hover_popover } from './register_block_hover_popover.js';

export function register_item_hover_popover(container, item, plugin = null) {
  if (!plugin) plugin = item.env.plugin;
  if (!plugin) return console.warn('Could not register hover popover – plugin not provided or found on item env');
  if (item.key.indexOf('{') === -1) {
    container.addEventListener('mouseover', (event) => {
      const linktext_path = item.key.replace(/#$/, ''); // remove trailing hash if present
      plugin.app.workspace.trigger('hover-link', {
        event,
        source: 'smart-connections-view',
        hoverParent: container.parentElement,
        targetEl: container,
        linktext: linktext_path
      });
    });
  } else {
    register_block_hover_popover(container.parentElement, container, item.env, item.key, plugin);
  }
}
