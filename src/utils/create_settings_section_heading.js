export function create_settings_section_heading(heading) {
  return {
    type: 'html',
    value: `<h2 class="sc-settings-heading">${heading}</h2>`
  };
}
