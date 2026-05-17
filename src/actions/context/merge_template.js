import { build_file_tree_string } from 'smart-utils/file_tree.js';
import {
  get_context_templates,
  get_template_preset_options,
} from '../../utils/smart-context/template_presets.js';

// THIS SHOULD BE HANDLED MUCH BETTER IN ARCHITECTURE AND REPLACEMENT LOGIC
// LEZER?
export async function merge_template(context_items_text, params={}) {
  const context_items = params.context_items || [];
  const MERGE_VARS = {
    'FILE_TREE': () => {
      const active_file_path = this.env?.obsidian_app?.workspace?.getActiveFile?.()?.path;
      let did_mark_current = false;
      const tree_keys = context_items.map((item) => {
        if (!did_mark_current && active_file_path && item.key.split('#')[0] === active_file_path) {
          did_mark_current = true;
          return `${item.key} (current)`;
        }
        return item.key;
      });
      return build_file_tree_string(tree_keys);
    },
  };

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
    callback(template_value) {
      const is_pro = this?.env?.is_pro;
      if (!is_pro) return;
      if (template_value !== 'custom') return;
      this.emit_event('context:custom_template_set');
    },
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
        <li><code>{{FILE_TREE}}</code> - Shows hierarchical view of all files and marks the active note with <code>(current)</code></li>
      </ul>
    `,
  },
};

export const default_settings = {
  template_preset: 'xml_structured',
  template_before: '<context>\n{{FILE_TREE}}',
  template_after: '</context>',
};

