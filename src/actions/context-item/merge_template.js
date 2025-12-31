import { convert_to_time_ago } from 'smart-utils/convert_to_time_ago.js';
import {
  get_item_templates,
  get_template_preset_options,
} from '../template_presets.js';

/**
 * Extract a context item's file name without directories or fragments.
 * @param {string} key
 * @returns {string}
 */
const derive_item_name_from_key = (key = '') => {
  if (typeof key !== 'string' || key.trim().length === 0) return '';
  const [filename_with_fragment] = key.split(/[\\/]/).slice(-1);
  return (filename_with_fragment || '').split('#')[0];
};
const get_item_name = (context_item) => {
  if (context_item.item_ref && typeof context_item.item_ref.get_display_name === 'function') {
    return context_item.item_ref.get_display_name({ show_full_path: false });
  }
  return derive_item_name_from_key(context_item.key);
}

// THIS SHOULD BE HANDLED MUCH BETTER IN ARCHITECTURE AND REPLACEMENT LOGIC
// LEZER?
export async function merge_template(context_items_text, context_items) {
  const MERGE_VARS = {
    'KEY': this.key,
    'ITEM_NAME': get_item_name(this),
    'TIME_AGO': convert_to_time_ago(this.mtime) || 'Missing',
    'LINK_DEPTH': this.data.d || 0,
  };
  const replace_vars = async (template) => {
    const re_var = /{{([\w_]+)}}/g;
    const number_of_var_matches = (template.match(re_var) || []).length;
    for (let i = 0; i < number_of_var_matches; i++) {
      template = template.replace(/{{(\w+)}}/g, (match, p1) => {
        return MERGE_VARS[p1] || '';
      });
    }
    return template;
  };
  const templates = get_item_templates(this.settings, default_settings);
  const before = await replace_vars(templates.template_before);
  const after = await replace_vars(templates.template_after);
  return ['', before, context_items_text, after, ''].join('\n');
}

export const settings_config = {
  template_preset: {
    group: 'Item templates',
    type: 'dropdown',
    name: 'Select template',
    description: 'Wraps each context item with a pre-configured template.',
    options_callback: () => get_template_preset_options(),
  },
  template_before: {
    group: 'Item templates',
    type: 'textarea',
    name: 'Template Before',
    description: 'Template to wrap before the context item content.',
    scope_class: 'pro-setting',
  },
  template_after: {
    group: 'Item templates',
    type: 'textarea',
    name: 'Template After',
    description: 'Template to wrap after the context item content.',
    scope_class: 'pro-setting',
  },
  item_explanation: {
    type: 'html',
    group: 'Item templates',
    value: `
        <b>Available variables:</b>
        <ul>
          <li><code>{{KEY}}</code> - Full path of the item</li>
          <li><code>{{ITEM_NAME}}</code> - Source file or block name without folder path</li>
          <li><code>{{TIME_AGO}}</code> - Time since the item was last modified</li>
          <li><code>{{LINK_DEPTH}}</code> - Depth level of the item</li>
        </ul>
    `
  },
};  

export const default_settings = {
  template_preset: 'xml_structured',
  template_before: '<item loc="{{KEY}}" at="{{TIME_AGO}}">',
  template_after: '</item>',
};