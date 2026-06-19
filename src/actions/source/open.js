import { open_source } from '../../utils/open_source.js';

export async function source_open(event = null) {
  await open_source(this, event);
}

export const menus = {
  'source:action_menu': {
    title: 'Open source',
    icon: 'external-link',
    order: 10,
  },
};
