import test from 'ava';
import {
  project_smart_source_read_request,
  smart_source_read,
} from './read.js';

test('smart_source_read returns Smart Source text without routing params', async (t) => {
  const source = {
    async read(...args) {
      t.deepEqual(args, []);
      return 'Alpha source text';
    },
  };

  t.is(
    await smart_source_read.call(source),
    'Alpha source text',
  );
});

test('smart_source_read projects an exact public key into the source scope', (t) => {
  const source = {
    key: 'Projects/Alpha.md',
  };
  const env = {
    smart_sources: {
      items: {
        [source.key]: source,
      },
      get(key) {
        return this.items[key];
      },
    },
  };

  t.deepEqual(
    project_smart_source_read_request(
      {
        key: source.key,
      },
      { env },
    ),
    {
      scope: source,
      params: {},
    },
  );

  t.throws(
    () => project_smart_source_read_request(
      {
        key: 'Alpha.md',
      },
      { env },
    ),
    { message: 'Smart Source not found: "Alpha.md".' },
  );
});

test('smart_source_read fails clearly when the scope cannot be read', async (t) => {
  await t.throwsAsync(
    () => smart_source_read.call({}),
    { message: 'Unable to read Smart Source.' },
  );
});
