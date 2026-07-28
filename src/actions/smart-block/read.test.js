import test from 'ava';
import { smart_block_read } from './read.js';

test('smart_block_read returns Smart Block text', async (t) => {
  const block = {
    async read(params) {
      t.deepEqual(params, {
        key: 'Notes/Alpha.md#Heading',
      });
      return 'Alpha heading block text';
    },
  };

  t.is(
    await smart_block_read.call(block, {
      key: 'Notes/Alpha.md#Heading',
    }),
    'Alpha heading block text',
  );
});

test('smart_block_read fails clearly when the scope cannot be read', async (t) => {
  await t.throwsAsync(
    () => smart_block_read.call({}, {}),
    { message: 'Unable to read Smart Block.' },
  );
});
