import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import test from 'ava';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stub_path = path.join(__dirname, '..', '..', 'node_modules', 'obsidian', 'index.js');
const stub_dir = path.dirname(stub_path);
fs.mkdirSync(stub_dir, { recursive: true });
fs.writeFileSync(stub_path, "export const MarkdownRenderer={render:async()=>{}};export const htmlToMarkdown=()=>'';export class Component{};");

const { ObsidianMarkdownSourceContentAdapter } = await import('./obsidian_markdown.js');

const create_adapter = (cache = {
  frontmatter: { tags: ['front'] },
  tags: [{ tag: '#inline' }, { tag: '#front' }],
}) => {
  const metadata_cache = {
    getFileCache: () => cache,
  };
  const app = { metadataCache: metadata_cache };
  const env = { main: { app } };
  return new ObsidianMarkdownSourceContentAdapter({
    data: {},
    env,
    file: {},
    collection: { fs: {} },
  });
};

test('get_metadata uses metadataCache tags', async t => {
  const adapter = create_adapter();
  const metadata = await adapter.get_metadata();
  t.deepEqual(metadata.tags.sort(), ['#front', '#inline']);
});

for (const [name, cache] of [
  ['no frontmatter or tags', {}],
  ['empty tag list', { tags: [] }],
  ['unavailable cache', null],
]) {
  test(`parse_content stores JSON metadata with ${name}`, async t => {
    const adapter = create_adapter(cache);
    adapter.data.metadata = { status: 'old', tags: ['#old'] };

    await adapter.parse_content('Plain note.');

    t.deepEqual(adapter.data.metadata, {});
    t.deepEqual(JSON.parse(JSON.stringify(adapter.data)), adapter.data);
  });
}

test('get_metadata retains frontmatter values without tags', async t => {
  const frontmatter = { status: 'active', archived: false, count: 0, owner: null };
  const adapter = create_adapter({ frontmatter });

  t.is(await adapter.get_metadata(), frontmatter);
  t.deepEqual(frontmatter, { status: 'active', archived: false, count: 0, owner: null });
});

test('get_metadata retains inline tags without frontmatter', async t => {
  const adapter = create_adapter({ tags: [{ tag: '#inline' }, { tag: '#inline' }] });

  t.deepEqual(await adapter.get_metadata(), { tags: ['#inline'] });
});
