import { addIcon } from "obsidian";
const svg_wrap_24 = (inner_svg) => {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner_svg}</svg>`;
};
const smart_copy_note_svg = svg_wrap_24(`
  <rect x="9" y="7" width="12" height="14" rx="2"></rect>
  <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"></path>
  <path d="M12 11h6"></path>
  <path d="M12 14h6"></path>
  <path d="M12 17h4"></path>
`);

const smart_context_builder_svg = svg_wrap_24(`
  <rect x="3" y="4" width="12" height="16" rx="2"></rect>
  <path d="M6 8h6"></path>
  <path d="M6 12h6"></path>
  <path d="M6 16h4"></path>
  <path d="M19 10v4"></path>
  <path d="M17 12h4"></path>
`);

const smart_inline_connections_svg = svg_wrap_24(`
  <path d="M4 6h16"></path>
  <path d="M4 18h16"></path>
  <circle cx="12" cy="12" r="3"></circle>
  <circle cx="7" cy="12" r="1" fill="currentColor" stroke="none"></circle>
  <circle cx="17" cy="12" r="1" fill="currentColor" stroke="none"></circle>
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
    <circle cx="11" cy="11" r="8"></circle>
  </clipPath>
  <symbol id="smart-lookup-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
    <g clip-path="url(#sc-in-search-clip)">
      <path d="M10.3,5.4 L14.5,8.2 L14.5,11.0 L10.3,16.6" stroke="currentColor" stroke-width="0.56" fill="none"></path>
      <path d="M7.5,9.6 L11.0,12.4" stroke="currentColor" stroke-width="0.7" fill="none"></path>
      <circle cx="10.3" cy="5.4" r="0.3" fill="currentColor"></circle>
      <circle cx="14.5" cy="8.2" r="0.3" fill="currentColor"></circle>
      <circle cx="14.5" cy="12.4" r="0.3" fill="currentColor"></circle>
      <circle cx="10.3" cy="16.6" r="0.3" fill="currentColor"></circle>
      <circle cx="7.5" cy="9.6" r="0.3" fill="currentColor"></circle>
    </g>
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.3-4.3"></path>
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
  <path d="M4 6h16"></path>
  <path d="M4 12h16"></path>
  <circle cx="12" cy="18" r="3"></circle>
  <circle cx="7" cy="18" r="1" fill="currentColor" stroke="none"></circle>
  <circle cx="17" cy="18" r="1" fill="currentColor" stroke="none"></circle>
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
  <rect x="3" y="5" width="8" height="14" rx="2"></rect>
  <rect x="13" y="5" width="8" height="14" rx="2"></rect>
  <path d="M8 10H16"></path>
  <path d="M8 14H16"></path>
  <circle cx="7" cy="10" r="1" fill="currentColor" stroke="none"></circle>
  <circle cx="7" cy="14" r="1" fill="currentColor" stroke="none"></circle>
  <circle cx="17" cy="10" r="1" fill="currentColor" stroke="none"></circle>
  <circle cx="17" cy="14" r="1" fill="currentColor" stroke="none"></circle>
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
}
