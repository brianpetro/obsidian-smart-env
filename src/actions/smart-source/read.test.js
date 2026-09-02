import test from 'ava';
import {
  input_schema,
  output_schema,
  project_smart_source_read_request,
  smart_source_read,
  tool,
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

test('smart_source_read returns stored source metadata without reading text', async (t) => {
  let read_count = 0;
  const source = {
    data: {
      key: 'Projects/Alpha.md',
      metadata: {
        status: 'active',
      },
      last_import: {
        mtime: 123,
        size: 456,
      },
    },
    async read() {
      read_count += 1;
      return 'Alpha source text';
    },
  };

  t.is(
    await smart_source_read.call(source, {
      output_type: 'meta',
    }),
    source.data,
  );
  t.is(read_count, 0);
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

  t.deepEqual(
    project_smart_source_read_request(
      {
        key: source.key,
        output_type: 'meta',
      },
      { env },
    ),
    {
      scope: source,
      params: {
        output_type: 'meta',
      },
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

test('smart_source_read exposes text and metadata output types', (t) => {
  t.deepEqual(input_schema.properties.output_type.enum, [
    'text',
    'meta',
  ]);
  t.deepEqual(tool.input_schema.properties.output_type.enum, [
    'text',
    'meta',
  ]);
  t.deepEqual(output_schema.type, [
    'string',
    'object',
  ]);
});

test('smart_source_read fails clearly when the scope cannot be read', async (t) => {
  await t.throwsAsync(
    () => smart_source_read.call({}),
    { message: 'Unable to read Smart Source.' },
  );
});
