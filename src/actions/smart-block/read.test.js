import test from 'ava';
import {
  project_smart_block_read_request,
  smart_block_read,
} from './read.js';

test('smart_block_read returns Smart Block text without routing params', async (t) => {
  const block = {
    async read(...args) {
      t.deepEqual(args, []);
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
