import { open_source } from '../../utils/open_source.js';

export async function source_open(params = null) {
  const event = params?.click_event || params?.event || params || null;
  await open_source(this, event);
}

export const menus = {
  'source:menu': {
    title: 'Open source',
    icon: 'external-link',
    order: 10,
    params(_menu_ctx, event) {
      return { event };
    },
  },
};

