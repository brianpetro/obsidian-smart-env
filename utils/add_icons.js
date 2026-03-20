import { addIcon } from "obsidian";

const svg_wrap_24 = (inner_svg) => {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner_svg}</svg>`;
};

const smart_copy_note_svg = svg_wrap_24(`
  <rect x="8.76" y="6.6" width="12.96" height="15.12" rx="2.16"></rect>
  <path d="M4.44 17.4H3.36a2.16 2.16 0 0 1-2.16-2.16V4.44a2.16 2.16 0 0 1 2.16-2.16h10.8a2.16 2.16 0 0 1 2.16 2.16v2.16"></path>
  <path d="M12 10.92h6.48"></path>
  <path d="M12 14.16h6.48"></path>
  <path d="M12 17.4h4.32"></path>
`);

const smart_context_builder_svg = svg_wrap_24(`
  <rect x="2.1" y="3.2" width="13.2" height="17.6" rx="2.2"></rect>
  <path d="M5.4 7.6h6.6"></path>
  <path d="M5.4 12h6.6"></path>
  <path d="M5.4 16.4h4.4"></path>
  <path d="M19.7 9.8v4.4"></path>
  <path d="M17.5 12h4.4"></path>
`);

const smart_inline_connections_svg = svg_wrap_24(`
  <path d="M2.4 4.8h19.2"></path>
  <path d="M2.4 19.2h19.2"></path>
  <circle cx="12" cy="12" r="3.6"></circle>
  <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"></circle>
  <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"></circle>
`);

/**
 * Registers the Smart Chat icon.
 */
export function add_smart_chat_icon() {
  addIcon("smart-chat", `<defs>
  <symbol id="smart-chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 4c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2h-8l-5 4v-4H4c-1.1 0-2-.9-2-2Z" stroke-width="2"></path>
    <path d="M7 8c.5.3 1.3.3 1.8 0" stroke-width="2"></path>
    <path d="M15.2 8c.5.3 1.3.3 1.8 0" stroke-width="2"></path>
    <path d="M8 11.5c1 .8 2.5 1.2 4 1.2s3-.4 4-1.2" stroke-width="2"></path>
  </symbol>
</defs>
<use href="#smart-chat-icon" />`);
}

/**
 * Registers the Smart Connections icon.
 */
export function add_smart_connections_icon() {
  addIcon("smart-connections", `<path d="M50,20 L80,40 L80,60 L50,100" stroke="currentColor" stroke-width="4" fill="none"/>
    <path d="M30,50 L55,70" stroke="currentColor" stroke-width="5" fill="none"/>
    <circle cx="50" cy="20" r="9" fill="currentColor"/>
    <circle cx="80" cy="40" r="9" fill="currentColor"/>
    <circle cx="80" cy="70" r="9" fill="currentColor"/>
    <circle cx="50" cy="100" r="9" fill="currentColor"/>
    <circle cx="30" cy="50" r="9" fill="currentColor"/>`);
}

/**
 * Registers the Smart Lookup icon.
 */
export function add_smart_lookup_icon() {
  addIcon("smart-lookup", `<defs>
  <clipPath id="sc-in-search-clip" clipPathUnits="userSpaceOnUse">
    <circle cx="10.9" cy="10.9" r="8.8"></circle>
  </clipPath>
  <symbol id="smart-lookup-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
    <g clip-path="url(#sc-in-search-clip)">
      <path d="M10.13 4.74L14.75 7.82L14.75 10.9L10.13 17.06" stroke="currentColor" stroke-width="0.56" fill="none"></path>
      <path d="M7.05 9.36L10.9 12.44" stroke="currentColor" stroke-width="0.7" fill="none"></path>
      <circle cx="10.13" cy="4.74" r="0.33" fill="currentColor"></circle>
      <circle cx="14.75" cy="7.82" r="0.33" fill="currentColor"></circle>
      <circle cx="14.75" cy="12.44" r="0.33" fill="currentColor"></circle>
      <circle cx="10.13" cy="17.06" r="0.33" fill="currentColor"></circle>
      <circle cx="7.05" cy="9.36" r="0.33" fill="currentColor"></circle>
    </g>
    <circle cx="10.9" cy="10.9" r="8.8"></circle>
    <path d="M21.9 21.9L17.17 17.17"></path>
  </symbol>
</defs>
<use href="#smart-lookup-icon" />`);
}

/**
 * Registers the Copy Note icon (small-size safe).
 * Icon names: sc-copy-note, smart-copy-note
 */
export function add_smart_copy_context_icon() {
  addIcon("smart-copy-note", smart_copy_note_svg);
}

/**
 * Registers the Context Builder icon (small-size safe).
 * Icon names: sc-context-builder, smart-context-builder
 */
export function add_smart_context_icon() {
  addIcon("smart-context-builder", smart_context_builder_svg);
}

/**
 * Registers the Inline Connections icon (dots 16px variant).
 * Icon names: sc-inline-connections-dots, smart-inline-connections-dots
 */
export function add_inline_connections_icon() {
  addIcon("smart-inline-connections", smart_inline_connections_svg);
}

const smart_footer_connections_svg = svg_wrap_24(`
  <path d="M2.72 5.04h18.56"></path>
  <path d="M2.72 12h18.56"></path>
  <circle cx="12" cy="18.96" r="3.48"></circle>
  <circle cx="6.2" cy="18.96" r="1.16" fill="currentColor" stroke="none"></circle>
  <circle cx="17.8" cy="18.96" r="1.16" fill="currentColor" stroke="none"></circle>
`);

/**
 * Registers the Footer Connections icon (small-size safe).
 * Icon names: smart-footer-connections
 */
export function add_footer_connections_icon() {
  addIcon("smart-footer-connections", smart_footer_connections_svg);
}


// register smart-dupe-detector icon
export function add_smart_dupe_detector_icon() {
  addIcon("smart-dupe-detector", `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="1.92" y="4.16" width="8.96" height="15.68" rx="2.24"></rect>
  <rect x="13.12" y="4.16" width="8.96" height="15.68" rx="2.24"></rect>
  <path d="M7.52 9.76H16.48"></path>
  <path d="M7.52 14.24H16.48"></path>
  <circle cx="6.4" cy="9.76" r="1.12" fill="currentColor" stroke="none"></circle>
  <circle cx="6.4" cy="14.24" r="1.12" fill="currentColor" stroke="none"></circle>
  <circle cx="17.6" cy="9.76" r="1.12" fill="currentColor" stroke="none"></circle>
  <circle cx="17.6" cy="14.24" r="1.12" fill="currentColor" stroke="none"></circle>
</svg>
`);
}

// register smart-named-contexts
export function add_smart_named_contexts_icon() {
  addIcon("smart-named-contexts", `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M19.84 22.08 12 17.6 4.16 22.08V4.16a2.24 2.24 0 0 1 2.24-2.24H17.6a2.24 2.24 0 0 1 2.24 2.24v17.92Z"></path>
  <path d="M7.52 7.52h8.96"></path>
  <path d="M7.52 10.88h8.96"></path>
  <path d="M7.52 14.24h6.72"></path>
</svg>
`);
}



/**
 * Convenience: register all "sc-*" icons in this module.
 */
export function add_smart_icons() {
  add_smart_copy_context_icon();
  add_smart_context_icon();
  add_inline_connections_icon();
  add_footer_connections_icon();
  add_smart_dupe_detector_icon();
  add_smart_named_contexts_icon();
}