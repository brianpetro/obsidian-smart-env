import {Notice} from 'obsidian';

export function register_first_of_event_notifications(env) {
  env.events.on('event_log:first', (data) => {
    const event_key = data?.first_of_event_key;
    if (typeof event_key === 'string' && event_key in EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY) {
      const frag = document.createDocumentFragment();
      const msg = `You achieved a new Smart Milestone 🎉`;
      const msg_el = document.createElement('p');
      msg_el.textContent = msg;
      frag.appendChild(msg_el);
      const milestone_el = document.createElement('p');
      milestone_el.textContent = `✅ ${EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY[event_key].milestone}`;
      milestone_el.style.color = 'var(--color-green)';
      milestone_el.style.fontStyle = 'italic';
      frag.appendChild(milestone_el);
      const btn = document.createElement('button');
      btn.textContent = 'View milestones';
      btn.addEventListener('click', () => {
        env.open_milestones_modal();
      });
      frag.appendChild(btn);
      new Notice(frag, 7000);
    }
  });
}

/**
 * Checklist items keyed by their emitted event key.
 *
 * Each entry is a *single* target event key mapped to:
 *  - group: relevant plugin/feature set
 *  - milestone: description of the result achieved by emitting the event
 *  - is_pro: whether the milestone is Pro-only (adds badge in UI)
 *
 * @type {Record<string, {group: string, milestone: string, is_pro?: boolean}>}
 */
export const EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY = {
  // Environment
  'sources:import_completed': {
    group: 'Environment',
    milestone: 'Initial vault import completed (all sources discovered).',
  },
  'embedding:completed': {
    group: 'Environment',
    milestone: 'Initial embedding completed, you are ready to make connections!',
  },

  // Connections
  'connections:opened': {
    group: 'Connections',
    milestone: 'Opened the connections view.',
  },
  'connections:drag_result': {
    group: 'Connections',
    milestone: 'Dragged a Smart Connections result into a note to create a link.',
  },
  'connections:open_result': {
    group: 'Connections',
    milestone: 'Opened a Smart Connections result from the UI (list item or inline popover).',
  },
  'connections:sent_to_context': {
    group: 'Connections',
    milestone: 'Sent Connections results to Smart Context (turn discovery into a context pack).',
  },
  'connections:copied_list': {
    group: 'Connections',
    milestone: 'Copied Connections results as a list of links.',
  },
  'connections:hover_preview': {
    group: 'Connections',
    milestone: 'Previewed a connection by holding cmd/ctrl while hovering the result.',
  },

  // Lookup
  'lookup:hover_preview': {
    group: 'Lookup',
    milestone: 'Previewed a Smart Lookup result by holding cmd/ctrl while hovering.',
  },
  'lookup:get_results': {
    group: 'Lookup',
    milestone: 'Submitted a lookup query (started a semantic search).',
  },
  'lookup:drag_result': {
    group: 'Lookup',
    milestone: 'Dragged a Smart Lookup result into a note to create a link.',
  },
  'lookup:open_result': {
    group: 'Lookup',
    milestone: 'Opened a Lookup result.',
  },

  // Context
  'context:created': {
    group: 'Context',
    milestone: 'First context created!',
  },
  'context:copied': {
    group: 'Context',
    milestone: 'Copied context to clipboard.',
  },
  'context_selector:open': {
    group: 'Context',
    milestone: 'Opened the Context Builder selector modal.',
  },
  'context:named': {
    group: 'Context',
    milestone: 'Named a Smart Context (created a reusable saved context).',
  },
  'context:renamed': {
    group: 'Context',
    milestone: 'Renamed a Smart Context (increased clarity).',
  },
  'context:copied_with_media': {
    group: 'Context',
    milestone: 'Copied context with media (images/PDF pages) for multimodal workflows.',
    is_pro: true,
  },

  // Chat
  'chat_codeblock:saved_thread': {
    group: 'Chat',
    milestone: 'Started a chat in a Smart Chat codeblock (opened the loop).',
  },
  'completion:completed': {
    group: 'Chat',
    milestone: 'Received the first Smart Chat response (a completion finished).',
    is_pro: true,
  },
  'chat_codeblock:marked_done': {
    group: 'Chat',
    milestone: 'Marked the chat thread as done (closed the loop).',
  },

  // Pro
  'smart_plugins_oauth_completed': {
    group: 'Pro',
    milestone: 'Connected account (enabled Pro plugins).',
  },

  // Inline connections (Pro)
  'inline_connections:show': {
    group: 'Inline connections',
    milestone: 'Opened inline connections in-note (used the inline workflow).',
    is_pro: true,
  },
  'inline_connections:open_result': {
    group: 'Inline connections',
    milestone: 'Opened an inline connections result (navigated from discovery to source).',
    is_pro: true,
  },
  'inline_connections:drag_result': {
    group: 'Inline connections',
    milestone: 'Inserted an inline link from an inline connection (converted discovery into a durable link).',
    is_pro: true,
  },
};

/**
 * Stable order for checklist groups.
 * Groups not in this list will be appended alphabetically after these.
 * @type {string[]}
 */
const EVENTS_CHECKLIST_GROUP_ORDER = [
  'Environment',
  'Connections',
  'Lookup',
  'Context',
  'Chat',
  'Pro',
  'Inline connections',
];

/**
 * Convert the checklist map into an ordered array of groups with ordered items.
 * @param {Record<string, {group: string, milestone: string, is_pro?: boolean}>} items_by_event_key
 * @returns {Array<{group: string, items: Array<{event_key: string, group: string, milestone: string, is_pro?: boolean}>}>}
 */
export function derive_events_checklist_groups(items_by_event_key) {
  const group_map = Object.entries(items_by_event_key || {}).reduce((acc, [event_key, item]) => {
    const group = item?.group || 'Other';
    if (!acc[group]) acc[group] = [];
    acc[group].push({ event_key, group, milestone: item?.milestone || '', ...item });
    return acc;
  }, /** @type {Record<string, Array<{event_key: string, group: string, milestone: string, is_pro?: boolean}>>} */ ({}));

  const all_groups = Object.keys(group_map);
  const order_index = EVENTS_CHECKLIST_GROUP_ORDER.reduce((acc, name, idx) => {
    acc[name] = idx;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));

  const sorted_groups = all_groups.sort((a, b) => {
    const a_has = Object.prototype.hasOwnProperty.call(order_index, a);
    const b_has = Object.prototype.hasOwnProperty.call(order_index, b);
    if (a_has && b_has) return order_index[a] - order_index[b];
    if (a_has) return -1;
    if (b_has) return 1;
    return a.localeCompare(b);
  });

  return sorted_groups.map((group) => {
    const items = (group_map[group] || []).slice();
    return { group, items };
  });
}
