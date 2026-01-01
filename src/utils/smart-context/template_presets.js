const DEFAULT_TEMPLATE_PRESET = 'xml_structured';

export const template_presets = {
  xml_structured: {
    label: 'XML-style (default)',
    context_template_before: '<context>\n{{FILE_TREE}}',
    context_template_after: '</context>',
    item_template_before: '<item loc="{{KEY}}" at="{{TIME_AGO}}" depth="{{LINK_DEPTH}}">',
    item_template_after: '</item>',
  },
  markdown_headings: {
    label: 'Markdown headings',
    context_template_before: '{{FILE_TREE}}',
    context_template_after: '',
    item_template_before: [
      '## {{KEY}}',
      'Updated: {{TIME_AGO}} | Depth: {{LINK_DEPTH}}',
      '````{{EXT}}',
    ].join('\n'),
    item_template_after: '````\n',
  },
  json_structured: {
    label: 'JSON structured',
    context_template_before: '{\n  "context": {',
    context_template_after: '  }\n}',
    item_template_before: '    "{{KEY}}": { "name": "{{ITEM_NAME}}", "updated": "{{TIME_AGO}}", "depth": {{LINK_DEPTH}}, "content": ',
    item_template_after: '    },',
    json_stringify: true,
  },
  // PRO
  custom: {
    label: 'Custom (PRO)',
  },
};

const get_preset_key = (settings = {}) => {
  const preset_key = settings.template_preset || DEFAULT_TEMPLATE_PRESET;
  if (template_presets[preset_key]) return preset_key;
  return 'custom';
};

const get_template_value = (settings, defaults, preset_field_key, settings_field_key) => {
  const preset_key = get_preset_key(settings);
  const preset = template_presets[preset_key];

  if (preset_key !== 'custom' && preset && typeof preset[preset_field_key] === 'string') {
    return preset[preset_field_key];
  }

  return settings?.[settings_field_key] || defaults?.[settings_field_key];
};

export function get_template_preset_options() {
  return Object.entries(template_presets).map(([value, config]) => ({
    value,
    label: config.label || value,
  }));
}

export function get_context_templates(settings = {}, defaults = {}) {
  return {
    template_before: get_template_value(settings, defaults, 'context_template_before', 'template_before'),
    template_after: get_template_value(settings, defaults, 'context_template_after', 'template_after'),
  };
}

export function get_item_templates(settings = {}, defaults = {}) {
  // get preset object
  const preset_key = get_preset_key(settings);
  const preset = template_presets[preset_key];
  return {
    ...(preset && typeof preset === 'object' ? preset : {}), // include all preset fields
    template_before: get_template_value(settings, defaults, 'item_template_before', 'template_before'),
    template_after: get_template_value(settings, defaults, 'item_template_after', 'template_after'),
  };
}
