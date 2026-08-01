import test from 'ava';
import { context_suggest_sources } from './sources.js';

const create_context = () => ({
  env: {
    smart_sources: {
      items: {
        'note.md': { key: 'note.md', file_type: 'md', is_media: false },
        'dashboard.base': { key: 'dashboard.base', file_type: 'base', is_media: false },
        'map.canvas': { key: 'map.canvas', file_type: 'canvas', is_media: false },
        'notes.txt': { key: 'notes.txt', file_type: 'txt', is_media: false },
        'drawing.excalidraw.md': {
          key: 'drawing.excalidraw.md',
          file_type: 'excalidraw.md',
          is_media: true,
        },
        'image.png': { key: 'image.png', file_type: 'png', is_media: true },
      },
    },
  },
  add_item() {},
});

test('context_suggest_sources defaults to note source file types', (t) => {
  const suggestions = context_suggest_sources.call(create_context());

  t.deepEqual(suggestions.map(({ key }) => key), [
    'note.md',
    'dashboard.base',
    'map.canvas',
  ]);
});

test('context_suggest_sources accepts a source filter override', (t) => {
  const suggestions = context_suggest_sources.call(create_context(), {
    source_filter: (source) => source.is_media === true,
  });

  t.deepEqual(suggestions.map(({ key }) => key), [
    'drawing.excalidraw.md',
    'image.png',
  ]);
});
