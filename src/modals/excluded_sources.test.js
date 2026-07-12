import test from 'ava';
import { ExcludedSourcesModal } from './excluded_sources.js';

function create_element(rendered) {
  return {
    createEl(_tag, opts = {}) {
      if (opts.text) rendered.push(opts.text);
      return create_element(rendered);
    },
    setText(text) {
      rendered.push(text);
    },
  };
}

test('render_excluded_list uses the active adapter length policy', async (t) => {
  const rendered = [];
  const checked_paths = [];
  const scope = {
    app: {
      vault: {
        getMarkdownFiles() {
          return [{ path: 'Short.md' }, { path: `Long/${'x'.repeat(220)}.md` }];
        },
      },
    },
    env: {
      smart_sources: { excluded_file_paths: ['Configured.md'] },
      fs: {
        adapter: {
          should_exclude_path_for_length(path) {
            checked_paths.push(path);
            return path.length > 200;
          },
        },
      },
    },
    contentEl: {
      empty() {},
      createEl(_tag, opts = {}) {
        if (opts.text) rendered.push(opts.text);
        return create_element(rendered);
      },
    },
  };

  await ExcludedSourcesModal.prototype.render_excluded_list.call(scope);

  t.deepEqual(checked_paths, ['Short.md', `Long/${'x'.repeat(220)}.md`]);
  t.true(rendered.includes('Configured.md'));
  t.true(rendered.includes('Paths too long to import into Smart Environment'));
  t.true(rendered.some((text) => text.startsWith('Long/')));
});
