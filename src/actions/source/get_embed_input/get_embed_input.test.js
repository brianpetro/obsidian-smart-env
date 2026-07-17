import test from 'ava';
import { source_get_embed_input_base } from './base.js';
import { source_get_embed_input_canvas } from './canvas.js';
import { source_get_embed_input_rendered } from './rendered.js';

const create_source = path => ({
  _embed_input: '',
  path,
  excluded_lines: [],
  collection: {
    embed_model: {
      model: {
        data: { max_tokens: 100 },
      },
    },
  },
  async read() {
    return 'content';
  },
});

test('Canvas and rendered actions preserve the v2 source embedding output', async t => {
  const canvas = create_source('Boards/Plan.canvas');
  const rendered = create_source('Rendered/Report.rendered');

  t.is(
    await source_get_embed_input_canvas.call(canvas),
    'Boards > Plan.canvas:\ncontent',
  );
  t.is(
    await source_get_embed_input_rendered.call(rendered),
    'Rendered > Report.rendered:\ncontent',
  );
});

test('Base source action intentionally returns no source embedding input', async t => {
  const source = { _embed_input: 'stale' };

  t.is(await source_get_embed_input_base.call(source), '');
  t.is(source._embed_input, '');
});
