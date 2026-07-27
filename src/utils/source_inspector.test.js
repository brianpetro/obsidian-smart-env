import test from 'ava';
import {
  extract_block_content,
  get_block_display_name,
  get_embedding_status_key,
  load_source_inspector_records,
  materialize_block_content,
} from './source_inspector.js';

const MODEL_FINGERPRINT = 'mf_current';
const SOURCE_CONTENT = [
  '# Heading',
  'Alpha',
  '## Child',
  'Beta',
  'Tail',
  'Last line',
].join('\n');

function create_embeddings() {
  return {
    get_active_file_info() {
      return {
        model_fingerprint: MODEL_FINGERPRINT,
        file: MODEL_FINGERPRINT,
        dims: 3,
        value_count: 12,
      };
    },
  };
}

function create_ref(file_i, read_hash) {
  return {
    file: MODEL_FINGERPRINT,
    file_i,
    read_hash,
    at: 1,
  };
}

function create_block({
  key,
  sub_key,
  lines,
  should_embed,
  read_hash,
  ref = null,
  embeddings,
}) {
  let read_calls = 0;
  let embed_input_calls = 0;
  return {
    key,
    sub_key,
    line_start: lines[0],
    line_end: lines[1],
    size: 999,
    should_embed,
    collection: {
      embeddings,
    },
    data: {
      last_read: {
        hash: read_hash,
      },
      embedding: ref
        ? {
          default: {
            [MODEL_FINGERPRINT]: ref,
          },
        }
        : {},
    },
    async read() {
      read_calls += 1;
      throw new Error('initial inspector load must not call block.read');
    },
    async get_embed_input() {
      embed_input_calls += 1;
      throw new Error('initial inspector load must not generate embed inputs');
    },
    get read_calls() {
      return read_calls;
    },
    get embed_input_calls() {
      return embed_input_calls;
    },
  };
}

test('source inspector reads once and builds lightweight sorted records', async t => {
  const embeddings = create_embeddings();
  const heading = create_block({
    key: 'Notes/Test.md#Heading',
    sub_key: '#Heading',
    lines: [1, 4],
    should_embed: true,
    read_hash: 'heading-hash',
    ref: create_ref(0, 'heading-hash'),
    embeddings,
  });
  const child = create_block({
    key: 'Notes/Test.md#Heading#Child',
    sub_key: '#Heading#Child',
    lines: [3, 4],
    should_embed: true,
    read_hash: 'child-new',
    ref: create_ref(1, 'child-old'),
    embeddings,
  });
  const unexpected = create_block({
    key: 'Notes/Test.md#Tail',
    sub_key: '#Tail',
    lines: [5, 5],
    should_embed: false,
    read_hash: 'tail-hash',
    ref: create_ref(1, 'tail-hash'),
    embeddings,
  });
  const skipped = create_block({
    key: 'Notes/Test.md#Last',
    sub_key: '#Last',
    lines: [6, 6],
    should_embed: false,
    read_hash: 'last-hash',
    embeddings,
  });

  let source_reads = 0;
  let blocks_reads = 0;
  const source = {
    key: 'Notes/Test.md',
    path: 'Notes/Test.md',
    should_embed: true,
    collection: {
      embeddings,
    },
    data: {
      last_read: {
        hash: 'source-hash',
      },
      embedding: {
        default: {
          [MODEL_FINGERPRINT]: create_ref(2, 'source-hash'),
        },
      },
    },
    get blocks() {
      blocks_reads += 1;
      return [unexpected, child, skipped, heading];
    },
    async read() {
      source_reads += 1;
      return SOURCE_CONTENT;
    },
  };

  const result = await load_source_inspector_records(source, {
    yield_after_ms: Number.POSITIVE_INFINITY,
  });

  t.is(source_reads, 1);
  t.is(blocks_reads, 1);
  t.deepEqual(
    result.records.map((record) => record.key),
    [heading.key, child.key, unexpected.key, skipped.key],
  );
  t.deepEqual(result.summary, {
    total: 4,
    processed: 4,
    should_embed: 2,
    should_not_embed: 2,
    vectorized: 2,
    embedded: 1,
    missing: 1,
    skipped: 1,
    unexpected: 1,
  });
  t.deepEqual(result.source_status, {
    should_embed: true,
    vectorized: true,
    status_key: 'embedded',
  });
  t.is(result.char_count, SOURCE_CONTENT.length);
  t.is(result.line_count, 6);
  t.true(result.records.every((record) => record.content === null));
  t.true(result.records.every((record) => record.content_loaded === false));
  [heading, child, unexpected, skipped].forEach((block) => {
    t.is(block.read_calls, 0);
    t.is(block.embed_input_calls, 0);
  });

  const heading_record = result.records[0];
  t.is(
    materialize_block_content(heading_record, result.source_lines),
    '# Heading\nAlpha\n## Child\nBeta',
  );
  t.true(heading_record.content_loaded);
  t.is(heading_record.size, 29);
  t.is(
    materialize_block_content(heading_record, ['changed']),
    '# Heading\nAlpha\n## Child\nBeta',
  );
});

test('source inspector revalidates changed block hashes from the single source read', async t => {
  const embeddings = create_embeddings();
  const current_content = '# Heading\nAlpha';
  const current_block_hash = `hash:${current_content}`;
  let block_adapter_reads = 0;
  let create_hash_calls = 0;
  let source_reads = 0;
  const block = create_block({
    key: 'Notes/Test.md#Heading',
    sub_key: '#Heading',
    lines: [1, 2],
    should_embed: true,
    read_hash: 'persisted-old-block-hash',
    ref: create_ref(0, current_block_hash),
    embeddings,
  });
  Object.defineProperty(block, 'block_adapter', {
    get() {
      block_adapter_reads += 1;
      return {
        create_hash(content) {
          create_hash_calls += 1;
          return `hash:${content}`;
        },
      };
    },
  });

  const source = {
    key: 'Notes/Test.md',
    should_embed: true,
    collection: {
      embeddings,
    },
    data: {
      last_read: {
        hash: 'persisted-old-source-hash',
      },
      embedding: {},
    },
    blocks: [block],
    async read() {
      source_reads += 1;
      this.data.last_read.hash = 'current-source-hash';
      return current_content;
    },
  };

  const result = await load_source_inspector_records(source, {
    yield_after_ms: Number.POSITIVE_INFINITY,
  });

  t.is(source_reads, 1);
  t.true(result.source_content_changed);
  t.is(block_adapter_reads, 1);
  t.is(create_hash_calls, 1);
  t.true(result.records[0].vectorized);
  t.is(result.records[0].status_key, 'embedded');
  t.is(result.records[0].size, current_content.length);
  t.is(result.records[0].content, null);
  t.false(result.records[0].content_loaded);
  t.is(block.data.last_read.hash, 'persisted-old-block-hash');
  t.is(block.read_calls, 0);
  t.is(block.embed_input_calls, 0);
});

test('source inspector helpers preserve inclusive line ranges and status meaning', t => {
  const lines = SOURCE_CONTENT.split('\n');

  t.is(
    extract_block_content(lines, { line_start: 3, line_end: 4 }),
    '## Child\nBeta',
  );
  t.is(
    get_block_display_name({ sub_key: '#Heading#Child' }),
    'Heading > Child',
  );
  t.is(get_block_display_name({ key: 'Notes/Test.md' }), 'Root block');
  t.is(get_embedding_status_key({ should_embed: true, vectorized: true }), 'embedded');
  t.is(get_embedding_status_key({ should_embed: true, vectorized: false }), 'missing');
  t.is(get_embedding_status_key({ should_embed: false, vectorized: false }), 'skipped');
  t.is(get_embedding_status_key({ should_embed: false, vectorized: true }), 'unexpected');
});
