import { build_file_tree_string } from 'smart-utils/file_tree.js';
import {
  get_context_templates,
  get_template_preset_options,
} from '../template_presets.js';

// THIS SHOULD BE HANDLED MUCH BETTER IN ARCHITECTURE AND REPLACEMENT LOGIC
// LEZER?
export async function merge_template(context_items_text, context_items) {
  const MERGE_VARS = {
    'FILE_TREE': () => {
      return build_file_tree_string(context_items.map(c => c.key));
    },
  }
  const replace_vars = async (template) => {
    const number_of_var_matches = (template.match(/{{(\w+)}}/g) || []).length;
    for (let i = 0; i < number_of_var_matches; i++) {
      template = template.replace(/{{(\w+)}}/gi, (match, p1) => {
        return MERGE_VARS[p1]?.() || '';
      });
    }
    return template;
  };
  const templates = get_context_templates(this.settings, default_settings);
  const before = await replace_vars(templates.template_before);
  const after = await replace_vars(templates.template_after);
  return [before, context_items_text, after].join('\n');
}
export const settings_config = {
  template_preset: {
    type: 'dropdown',
    group: 'Context templates',
    name: 'Select template',
    description: 'Wraps the full context with a pre-configured template.',
    options_callback: () => get_template_preset_options(),
  },
  template_before: {
    type: 'textarea',
    group: 'Context templates',
    name: 'Template Before',
    description: 'Template to wrap before the context.',
    scope_class: 'pro-setting',
  },
  template_after: {
    type: 'textarea',
    group: 'Context templates',
    name: 'Template After',
    description: 'Template to wrap after the context.',
    scope_class: 'pro-setting',
  },
  context_explanation: {
    type: 'html',
    group: 'Context templates',
    value: `<b>Available variables:</b>
      <ul>
        <li><code>{{FILE_TREE}}</code> - Shows hierarchical view of all files</li>
      </ul>
    `
  },
};
export const default_settings = {
  template_preset: 'xml_structured',
  template_before: '<context>\n{{FILE_TREE}}',
  template_after: '</context>',
};