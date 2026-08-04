import test from 'ava';
import {
  classify_dropped_obsidian_entry,
  parse_dropped_obsidian_data,
  parse_dropped_obsidian_entries,
} from './parse_dropped_obsidian_data.js';

function mock_dt({ files = [], uri = '', plain = '' } = {}) {
  return {
    files,
    getData(type) {
      return type === 'text/uri-list' ? uri : plain;
    },
  };
}

function get_entry(data_transfer) {
  return parse_dropped_obsidian_entries(data_transfer)[0];
}

test('parse_dropped_obsidian_data dedupes and flattens mixed inputs', (t) => {
  const data_transfer = mock_dt({
    files: [{ path: 'A.md' }],
    uri: 'obsidian://open?vault=V&file=B.md\nobsidian://open?vault=V&file=C.md',
    plain: 'C.md\nD.md',
  });

  t.deepEqual(
    [...parse_dropped_obsidian_data(data_transfer)].sort(),
    ['A.md', 'B.md', 'C.md', 'D.md'],
  );
});

test('parse_dropped_obsidian_data tolerates malformed Obsidian URIs split across lines', (t) => {
  const data_transfer = mock_dt({
    plain: 'obsidian:/\n/open?vault=X&file=Folder%2FNote.md',
  });

  t.deepEqual(
    [...parse_dropped_obsidian_data(data_transfer)],
    ['Folder/Note.md'],
  );
});

test('parse_dropped_obsidian_data skips empty rows', (t) => {
  const data_transfer = mock_dt({ plain: '\n   \n' });

  t.deepEqual([...parse_dropped_obsidian_data(data_transfer)], []);
});

test('parse_dropped_obsidian_data handles missing newlines between Obsidian URIs', (t) => {
  const data_transfer = mock_dt({
    plain: 'obsidian://open?vault=V&file=A.mdobsidian://open?vault=V&file=B.md',
  });

  t.deepEqual(
    [...parse_dropped_obsidian_data(data_transfer)].sort(),
    ['A.md', 'B.md'],
  );
});

test('parse_dropped_obsidian_data retains inferred Markdown compatibility', (t) => {
  const data_transfer = mock_dt({
    plain: 'obsidian://open?vault=V&file=A\nobsidian://open?vault=V&file=B',
  });

  t.deepEqual(
    [...parse_dropped_obsidian_data(data_transfer)].sort(),
    ['A.md', 'B.md'],
  );
});

test('parse_dropped_obsidian_entries preserves native provenance', (t) => {
  const data_transfer = mock_dt({
    files: [{ path: '/vault/Files/File.md' }],
    uri: 'obsidian://open?vault=V&file=Notes%2FNote',
    plain: 'Folders/Folder/\nBare',
  });

  t.deepEqual(parse_dropped_obsidian_entries(data_transfer), [
    {
      raw_value: '/vault/Files/File.md',
      normalized_path: '/vault/Files/File.md',
      origin: 'file_list',
      kind_hint: 'file',
      appended_md: false,
    },
    {
      raw_value: 'obsidian://open?vault=V&file=Notes%2FNote',
      normalized_path: 'Notes/Note.md',
      origin: 'obsidian_uri',
      kind_hint: 'file',
      appended_md: true,
    },
    {
      raw_value: 'Folders/Folder/',
      normalized_path: 'Folders/Folder',
      origin: 'plain_text',
      kind_hint: 'folder',
      appended_md: false,
    },
    {
      raw_value: 'Bare',
      normalized_path: 'Bare.md',
      origin: 'plain_text',
      kind_hint: null,
      appended_md: true,
    },
  ]);
});

test('classify_dropped_obsidian_entry validates absolute paths against the vault root', (t) => {
  const inside_entry = get_entry(mock_dt({
    files: [{ path: '/vault/Projects/Alpha.md' }],
  }));
  const outside_entry = get_entry(mock_dt({
    files: [{ path: '/outside/Projects/Alpha.md' }],
  }));
  const options = {
    file_paths: ['Projects/Alpha.md'],
    vault_path: '/vault',
  };

  t.deepEqual(classify_dropped_obsidian_entry(inside_entry, options), {
    status: 'exact',
    kind: 'file',
    path: 'Projects/Alpha.md',
  });
  t.deepEqual(classify_dropped_obsidian_entry(outside_entry, options), {
    status: 'unresolved',
    kind: null,
    path: null,
  });
});

test('classify_dropped_obsidian_entry makes exact unavailable files terminal', (t) => {
  const entry = get_entry(mock_dt({ plain: 'Alpha.md' }));

  t.deepEqual(classify_dropped_obsidian_entry(entry, {
    file_paths: [
      'Alpha.md',
      'Archive/Alpha.md',
    ],
    available_file_paths: ['Archive/Alpha.md'],
  }), {
    status: 'exact_unavailable',
    kind: 'file',
    path: 'Alpha.md',
  });
});

test('classify_dropped_obsidian_entry rejects ambiguous trailing paths', (t) => {
  const entry = get_entry(mock_dt({ plain: 'Alpha.md' }));

  t.deepEqual(classify_dropped_obsidian_entry(entry, {
    file_paths: [
      'Projects/Alpha.md',
      'Archive/Alpha.md',
    ],
  }), {
    status: 'ambiguous',
    kind: null,
    path: null,
  });
});

test('classify_dropped_obsidian_entry fails closed on inferred file and folder collisions', (t) => {
  const entry = get_entry(mock_dt({ plain: 'Acme' }));

  t.deepEqual(classify_dropped_obsidian_entry(entry, {
    file_paths: ['Acme.md'],
    folder_paths: ['Acme'],
  }), {
    status: 'ambiguous',
    kind: null,
    path: null,
  });
});

test('classify_dropped_obsidian_entry uses reliable kind provenance for collisions', (t) => {
  const file_entry = get_entry(mock_dt({
    uri: 'obsidian://open?vault=V&file=Acme',
  }));
  const folder_entry = get_entry(mock_dt({ plain: 'Acme/' }));
  const options = {
    file_paths: ['Acme.md'],
    folder_paths: ['Acme'],
  };

  t.deepEqual(classify_dropped_obsidian_entry(file_entry, options), {
    status: 'recovered',
    kind: 'file',
    path: 'Acme.md',
  });
  t.deepEqual(classify_dropped_obsidian_entry(folder_entry, options), {
    status: 'exact',
    kind: 'folder',
    path: 'Acme',
  });
});

test('classify_dropped_obsidian_entry applies folder recovery only to parser-inferred Markdown paths', (t) => {
  const inferred_entry = get_entry(mock_dt({ plain: 'Acme' }));
  const explicit_entry = get_entry(mock_dt({ plain: 'Acme.md' }));
  const options = {
    folder_paths: ['Projects/Clients/Acme'],
  };

  t.deepEqual(classify_dropped_obsidian_entry(inferred_entry, options), {
    status: 'recovered',
    kind: 'folder',
    path: 'Projects/Clients/Acme',
  });
  t.deepEqual(classify_dropped_obsidian_entry(explicit_entry, options), {
    status: 'unresolved',
    kind: null,
    path: null,
  });
});
