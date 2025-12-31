import test from 'ava';
import { build_file_tree_string } from 'smart-utils/file_tree.js';
import {
  template_presets,
  get_template_preset_options,
  get_context_templates,
  get_item_templates,
} from './template_presets.js';
import {
  merge_template as merge_context_template,
  default_settings as context_default_settings,
} from '../../actions/context/merge_template.js';
import {
  merge_template as merge_item_template,
  default_settings as item_default_settings,
} from '../../actions/context-item/merge_template.js';

const get_context = (settings = {}) => ({
  settings,
});

const get_context_item = (settings = {}, data = {}) => ({
  settings,
  data,
  key: 'Area/Note.md',
  mtime: Date.now(),
});

test('template preset options expose the expected presets plus custom', (t) => {
  const options = get_template_preset_options();
  const values = options.map((opt) => opt.value);

  t.deepEqual(values, [
    'xml_structured',
    'human_readable',
    'diff_friendly',
    'custom',
  ]);
});

test('get_context_templates respects preset defaults without mutating saved text', (t) => {
  const settings = {
    template_preset: 'diff_friendly',
    template_before: 'custom-before',
    template_after: 'custom-after',
  };

  const templates = get_context_templates(settings, context_default_settings);

  t.is(templates.template_before, template_presets.diff_friendly.context_template_before);
  t.is(templates.template_after, template_presets.diff_friendly.context_template_after);
  t.is(settings.template_before, 'custom-before');
  t.is(settings.template_after, 'custom-after');
});

test('get_context_templates uses custom templates when preset is custom', (t) => {
  const settings = {
    template_preset: 'custom',
    template_before: 'my-before',
    template_after: 'my-after',
  };

  const templates = get_context_templates(settings, context_default_settings);

  t.deepEqual(templates, {
    template_before: 'my-before',
    template_after: 'my-after',
  });
});

test('get_item_templates uses preset defaults and falls back to custom when requested', (t) => {
  const preset_templates = get_item_templates({ template_preset: 'xml_structured' }, item_default_settings);
  t.is(preset_templates.template_before, template_presets.xml_structured.item_template_before);
  t.is(preset_templates.template_after, template_presets.xml_structured.item_template_after);

  const custom_templates = get_item_templates({ template_preset: 'custom', template_before: 'x', template_after: 'y' }, item_default_settings);
  t.deepEqual(custom_templates, { template_before: 'x', template_after: 'y' });
});

test('context merge_template swaps in preset templates at runtime', async (t) => {
  const settings = { template_preset: 'human_readable' };
  const context_items = [
    { key: 'Area/Note.md' },
    { key: 'Inbox.md' },
  ];

  const merged = await merge_context_template.call(
    get_context(settings),
    'CONTENT',
    context_items,
  );

  const tree = build_file_tree_string(context_items.map((c) => c.key));

  t.true(merged.startsWith(`${tree}\n`));
  t.true(merged.includes('CONTENT'));
  t.true(merged.trimEnd().endsWith('CONTENT'));
});

test('context item merge_template honors presets without altering stored fields', async (t) => {
  const settings = {
    template_preset: 'diff_friendly',
    template_before: 'saved-before',
    template_after: 'saved-after',
  };
  const context_item = get_context_item(settings, { d: 2 });

  const merged = await merge_item_template.call(
    context_item,
    'ITEM-CONTENT',
  );

  t.true(merged.includes('FILE: Area/Note.md'));
  t.true(merged.includes('DEPTH: 2'));
  t.true(merged.includes('ITEM-CONTENT'));
  t.is(context_item.settings.template_before, 'saved-before');
});
