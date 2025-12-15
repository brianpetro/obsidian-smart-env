import { convert_to_time_ago } from 'smart-utils/convert_to_time_ago.js';
// THIS SHOULD BE HANDLED MUCH BETTER IN ARCHITECTURE AND REPLACEMENT LOGIC
// LEZER?
export async function merge_template(context_items_text, context_items) {
  const MERGE_VARS = {
    'KEY': this.key,
    'TIME_AGO': convert_to_time_ago(this.mtime) || 'Missing',
    'LINK_DEPTH': this.data.d || 0,
  }
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
  const before = await replace_vars(this.settings.template_before || default_settings.template_before);
  const after = await replace_vars(this.settings.template_after || default_settings.template_after);
  return ['', before, context_items_text, after, ''].join('\n');
}

export const settings_config = {
  item_explanation: {
    type: 'html',
    group: 'Item templates',
    value: `
        <b>Available variables:</b>
        <ul>
          <li><code>{{KEY}}</code> - Full path of the item</li>
          <li><code>{{TIME_AGO}}</code> - Time since the item was last modified</li>
          <li><code>{{LINK_DEPTH}}</code> - Depth level of the item</li>
        </ul>
    `
  },
  template_before: {
    group: 'Item templates',
    type: 'textarea',
    name: 'Template Before',
    description: 'Template to wrap before the context item content.',
  },
  template_after: {
    group: 'Item templates',
    type: 'textarea',
    name: 'Template After',
    description: 'Template to wrap after the context item content.',
  },
};  

export const default_settings = {
  template_before: '<item loc="{{KEY}}" at="{{TIME_AGO}}">',
  template_after: '</item>',
};