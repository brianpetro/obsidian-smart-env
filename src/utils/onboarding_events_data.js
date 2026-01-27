const PLUGIN_INSTALL_EVENT_CONFIG = {
  'connections:installed': {
    ids: ['smart-connections'],
  },
  'connections_pro:installed': {
    ids: ['smart-connections'],
    require_pro_name: true,
  },
  'context:installed': {
    ids: ['smart-context'],
  },
  'context_pro:installed': {
    ids: ['smart-context'],
    require_pro_name: true,
  },
  'chat:installed': {
    ids: ['smart-chatgpt', 'smart-chat'],
  },
  'chat_pro:installed': {
    ids: ['smart-chat'],
    require_pro_name: true,
  },
};

/**
 * Checklist items keyed by their emitted event key.
 *
 * Each entry is a *single* target event key mapped to:
 *  - group: relevant plugin/feature set
 *  - milestone: description of the result achieved by emitting the event
 *  - link: SmartConnections.app docs link for the milestone
 *  - is_pro: whether the milestone is Pro-only (adds badge in UI)
 *
 * @type {Record<string, {group: string, milestone: string, link: string, is_pro?: boolean}>}
 */
export const EVENTS_CHECKLIST_ITEMS_BY_EVENT_KEY = {
  // Environment
  'sources:import_completed': {
    group: 'Environment',
    milestone: 'Initial vault import completed (all sources discovered).',
    link: 'https://smartconnections.app/smart-environment/settings/?utm_source=milestones#sources',
  },
  'embedding:completed': {
    group: 'Environment',
    milestone: 'Initial embedding completed, you are ready to make connections!',
    link: 'https://smartconnections.app/smart-environment/settings/?utm_source=milestones#embedding-models',
  },

  // Connections
  'connections:installed': {
    group: 'Connections',
    milestone: 'Installed Smart Connections (core plugin).',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones',
  },
  'connections:opened': {
    group: 'Connections',
    milestone: 'Opened the connections view.',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones#quick-start',
  },
  'connections:drag_result': {
    group: 'Connections',
    milestone: 'Dragged a Smart Connections result into a note to create a link.',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones#drag-link',
  },
  'connections:open_result': {
    group: 'Connections',
    milestone: 'Opened a Smart Connections result from the UI (list item or inline popover).',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones#core-interactions',
  },
  'connections:sent_to_context': {
    group: 'Connections',
    milestone: 'Sent Connections results to Smart Context (turn discovery into a context pack).',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones#send-to-context',
  },
  'connections:copied_list': {
    group: 'Connections',
    milestone: 'Copied Connections results as a list of links.',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones#copy-list',
  },
  'connections:hover_preview': {
    group: 'Connections',
    milestone: 'Previewed a connection by holding cmd/ctrl while hovering the result.',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones#core-interactions',
  },
  'connections:open_random': {
    group: 'Connections',
    milestone: 'Opened a random connection from Smart Connections.',
    link: 'https://smartconnections.app/smart-connections/getting-started/?utm_source=milestones#open-a-random-connection',
  },
  "connections:hidden_item": {
    group: 'Connections',
    milestone: 'Hidden a connection item from the list.',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones#manage-noise',
  },
  "connections:pinned_item": {
    group: 'Connections',
    milestone: 'Pinned a connection item in the list.',
    link: 'https://smartconnections.app/smart-connections/list-feature/?utm_source=milestones#manage-noise',
  },

  // Connections Pro
  'connections_pro:installed': {
    group: 'Connections Pro',
    milestone: 'Installed Smart Connections Pro.',
    link: 'https://smartconnections.app/pro-plugins/?utm_source=milestones#connections-pro',
    is_pro: true,
  },

  // Lookup
  'lookup:hover_preview': {
    group: 'Lookup',
    milestone: 'Previewed a Smart Lookup result by holding cmd/ctrl while hovering.',
    link: 'https://smartconnections.app/smart-connections/lookup/?utm_source=milestones#understanding-results',
  },
  'lookup:get_results': {
    group: 'Lookup',
    milestone: 'Submitted a lookup query (started a semantic search).',
    link: 'https://smartconnections.app/smart-connections/lookup/?utm_source=milestones',
  },
  'lookup:drag_result': {
    group: 'Lookup',
    milestone: 'Dragged a Smart Lookup result into a note to create a link.',
    link: 'https://smartconnections.app/smart-connections/lookup/?utm_source=milestones#understanding-results',
  },
  'lookup:open_result': {
    group: 'Lookup',
    milestone: 'Opened a Lookup result.',
    link: 'https://smartconnections.app/smart-connections/lookup/?utm_source=milestones#understanding-results',
  },

  // Context
  'context:created': {
    group: 'Context',
    milestone: 'First context created!',
    link: 'https://smartconnections.app/smart-context/builder/?utm_source=milestones#quick-start',
  },
  'context:copied': {
    group: 'Context',
    milestone: 'Copied context to clipboard.',
    link: 'https://smartconnections.app/smart-context/clipboard/?utm_source=milestones#copy-current',
  },
  'context:file_nav_copied': {
    group: 'Context',
    milestone: 'Copied context from the file navigator.',
    link: 'https://smartconnections.app/smart-context/clipboard/?utm_source=milestones#copy-selected',
  },
  'context_selector:open': {
    group: 'Context',
    milestone: 'Opened the Context Builder selector modal.',
    link: 'https://smartconnections.app/smart-context/builder/?utm_source=milestones#open-builder',
  },
  'context:named': {
    group: 'Context',
    milestone: 'Named a Smart Context (created a reusable saved context).',
    link: 'https://smartconnections.app/smart-context/builder/?utm_source=milestones#save-reuse',
  },
  'context:renamed': {
    group: 'Context',
    milestone: 'Renamed a Smart Context (increased clarity).',
    link: 'https://smartconnections.app/smart-context/builder/?utm_source=milestones#save-reuse',
  },
  'context:copied_with_media': {
    group: 'Context Pro',
    milestone: 'Copied context with media (images/PDF pages) for multimodal workflows.',
    link: 'https://smartconnections.app/smart-context/clipboard/?utm_source=milestones#copy-modes',
    is_pro: true,
  },

  // Context Pro
  'context_pro:installed': {
    group: 'Context Pro',
    milestone: 'Installed Smart Context Pro.',
    link: 'https://smartconnections.app/pro-plugins/?utm_source=milestones#context-pro',
    is_pro: true,
  },

  // Chat
  'chat:installed': {
    group: 'Chat',
    milestone: 'Installed Smart ChatGPT.',
    link: 'https://smartconnections.app/smart-chat/?utm_source=milestones',
  },
  'chat_codeblock:saved_thread': {
    group: 'Chat',
    milestone: 'Started a chat in a Smart Chat codeblock (opened the loop).',
    link: 'https://smartconnections.app/smart-chat/codeblock/?utm_source=milestones#quick-start',
  },
  'completion:completed': {
    group: 'Chat Pro',
    milestone: 'Received the first Smart Chat response (a completion finished).',
    link: 'https://smartconnections.app/smart-chat/api-integration/?utm_source=milestones#quick-start',
    is_pro: true,
  },
  'chat_codeblock:marked_done': {
    group: 'Chat',
    milestone: 'Marked the chat thread as done (closed the loop).',
    link: 'https://smartconnections.app/smart-chat/codeblock/?utm_source=milestones#chat-inbox',
  },

  // Chat Pro
  'chat_pro:installed': {
    group: 'Chat Pro',
    milestone: 'Installed Smart Chat Pro.',
    link: 'https://smartconnections.app/pro-plugins/?utm_source=milestones#chat-pro',
    is_pro: true,
  },

  // Connections Pro (Inline Connections)
  'inline_connections:show': {
    group: 'Connections Pro',
    milestone: 'Opened inline connections in-note (used the inline workflow).',
    link: 'https://smartconnections.app/smart-connections/inline/?utm_source=milestones',
    is_pro: true,
  },
  'inline_connections:open_result': {
    group: 'Connections Pro',
    milestone: 'Opened an inline connections result (navigated from discovery to source).',
    link: 'https://smartconnections.app/smart-connections/inline/?utm_source=milestones',
    is_pro: true,
  },
  'inline_connections:drag_result': {
    group: 'Connections Pro',
    milestone: 'Inserted an inline link from an inline connection (converted discovery into a durable link).',
    link: 'https://smartconnections.app/smart-connections/inline/?utm_source=milestones',
    is_pro: true,
  },

  // Pro
  'smart_plugins_oauth_completed': {
    group: 'Pro',
    milestone: 'Connected account (enabled Pro plugins).',
    link: 'https://smartconnections.app/pro-plugins/?utm_source=milestones',
  },
  'referrals:copied_link': {
    group: 'Pro',
    milestone: 'Copied your referral link to share Pro.',
    link: 'https://smartconnections.app/pro-plugins/?utm_source=milestones#referrals',
    is_pro: true,
  },
  'referrals:opened_dashboard': {
    group: 'Pro',
    milestone: 'Opened the referrals dashboard to view bonuses.',
    link: 'https://smartconnections.app/my-referrals/?utm_source=milestones',
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
  'Connections Pro',
  'Context Pro',
  'Chat Pro',
];

/**
 * Convert the checklist map into an ordered array of groups with ordered items.
 * @param {Record<string, {group: string, milestone: string, link: string, is_pro?: boolean}>} items_by_event_key
 * @returns {Array<{group: string, items: Array<{event_key: string, group: string, milestone: string, link: string, is_pro?: boolean}>}>}
 */
export function derive_events_checklist_groups(items_by_event_key) {
  const group_map = Object.entries(items_by_event_key || {}).reduce((acc, [event_key, item]) => {
    const group = item?.group || 'Other';
    if (!acc[group]) acc[group] = [];
    acc[group].push({ event_key, group, milestone: item?.milestone || '', ...item });
    return acc;
  }, /** @type {Record<string, Array<{event_key: string, group: string, milestone: string, link: string, is_pro?: boolean}>>} */ ({}));

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

export function check_if_event_emitted(env, event_key) {
  const plugin_event_state = resolve_plugin_install_event(env, event_key);
  if (plugin_event_state === true) return true;

  if (env?.event_logs?.items?.[event_key]) return true;

  if (plugin_event_state === false) return false;

  return false;
}

function resolve_plugin_install_event(env, event_key) {
  const config = PLUGIN_INSTALL_EVENT_CONFIG[event_key];
  if (!config) return null;

  const manifests = env?.plugin?.app?.plugins?.manifests || {};
  const plugin_ids = Array.isArray(config.ids) ? config.ids : [];

  for (const plugin_id of plugin_ids) {
    const manifest = manifests[plugin_id];
    if (!manifest) continue;
    if (config.require_pro_name && !is_pro_manifest(manifest)) continue;
    return true;
  }

  return false;
}

function is_pro_manifest(manifest) {
  const name = manifest?.name;
  if (typeof name !== 'string') return false;
  return name.toLowerCase().includes('pro');
}
