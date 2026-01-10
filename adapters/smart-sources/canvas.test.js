import test from 'ava';

import { get_canvas_links } from './canvas.js';

test('get_canvas_links collects links from canvas nodes', t => {
  const canvas_content = JSON.stringify({
    nodes: [
      { id: '1', type: 'file', file: 'Notes/Note.md' },
      { id: '2', type: 'link', url: 'https://example.com' },
      { id: '3', type: 'text', text: 'See [[Local]] and [Doc](Docs/Guide.md)' },
      { id: '4', type: 'file', file: 'Attachments/image.png', subpath: '#Section' },
    ],
    edges: [],
  });

  const links = get_canvas_links({ content: canvas_content });

  t.deepEqual(links, [
    { title: 'Notes/Note.md', target: 'Notes/Note.md', line: 1 },
    { title: 'https://example.com', target: 'https://example.com', line: 1 },
    { title: 'Doc', target: 'Docs/Guide.md', line: 1 },
    { title: 'Local', target: 'Local', line: 1 },
    { title: 'Attachments/image.png', target: 'Attachments/image.png#Section', line: 1 },
  ]);
});

test('get_canvas_links returns empty array on invalid JSON', t => {
  const links = get_canvas_links({ content: '{not-json' });
  t.deepEqual(links, []);
});
