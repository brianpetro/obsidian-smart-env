import test from 'ava';
import { SmartSource } from 'smart-sources/smart_source.js';
import { SmartBlock } from 'smart-blocks/smart_block.js';
import { MarkdownBlockContentAdapter } from 'smart-blocks/adapters/markdown_block.js';
import {
  project_smart_block_read_request,
  smart_block_read,
} from './read.js';

test('smart_block_read requests strict text without routing params', async (t) => {
  const block = {
    async read(...args) {
      t.deepEqual(args, [{ throw_on_error: true }]);
      return 'Alpha heading block text';
    },
  };

  t.is(
    await smart_block_read.call(block),
    'Alpha heading block text',
  );
});

test('smart_block_read projects an exact public key into the block scope', (t) => {
  const block = {
    key: 'Notes/Alpha.md#Heading',
  };
  const env = {
    smart_blocks: {
      items: {
        [block.key]: block,
      },
      get(key) {
        return this.items[key];
      },
    },
  };

  t.deepEqual(
    project_smart_block_read_request(
      {
        key: block.key,
      },
      { env },
    ),
    {
      scope: block,
      params: {},
    },
  );

  t.throws(
    () => project_smart_block_read_request(
      {
        key: 'Alpha#Heading',
      },
      { env },
    ),
    { message: 'Smart Block not found: "Alpha#Heading".' },
  );
});

test('smart_block_read fails clearly when the scope cannot be read', async (t) => {
  await t.throwsAsync(
    () => smart_block_read.call({}),
    { message: 'Unable to read Smart Block.' },
  );
});

function create_markdown_block(read_source, line_start = 2, line_end = 3) {
  const source = {
    key: 'Notes/Alpha.md',
    read: SmartSource.prototype.read,
    use_source_adapter: SmartSource.prototype.use_source_adapter,
    source_adapter: { read: read_source },
  };
  const block = {
    key: 'Notes/Alpha.md#Heading',
    source,
    line_start,
    line_end,
    data: {},
    read: SmartBlock.prototype.read,
  };
  block.block_adapter = new MarkdownBlockContentAdapter(block);
  return block;
}

test('smart_block_read propagates Markdown source adapter failures', async (t) => {
  const read_error = new Error('Source content is unavailable');
  const block = create_markdown_block(async () => { throw read_error; });

  t.is(await t.throwsAsync(() => smart_block_read.call(block)), read_error);
});

test('smart_block_read preserves the Markdown block range and valid empty content', async (t) => {
  const block = create_markdown_block(async () => 'outside\n# Heading\nselected\nprivate');
  t.is(await smart_block_read.call(block), '# Heading\nselected');

  const empty_block = create_markdown_block(async () => '# Heading\n\nprivate', 2, 2);
  t.is(await smart_block_read.call(empty_block), '');
});

test('smart_block_read rejects a missing block instead of returning diagnostic text', async (t) => {
  const block = create_markdown_block(async () => '# Heading', null, null);

  await t.throwsAsync(
    () => smart_block_read.call(block),
    { message: /BLOCK NOT FOUND/ },
  );
});

test('smart_block_read rejects nullish results from a custom reader', async (t) => {
  for (const result of [null, undefined]) {
    await t.throwsAsync(
      () => smart_block_read.call({ read: async () => result }),
      { message: 'No content returned while reading Smart Block.' },
    );
  }
});
