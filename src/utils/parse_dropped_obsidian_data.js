/**
 * @module parse_dropped_obsidian_data
 * Native Obsidian drag data parsing and path classification helpers.
 */

function normalize_path(value) {
  const path = String(value || '')
    .trim()
    .replace(/\\+/g, '/')
  ;

  if (path === '/' || /^[a-zA-Z]:\/$/u.test(path)) return path;
  return path.replace(/\/+$/g, '');
}

function has_file_extension(value) {
  return /\.[^./\\]+$/u.test(String(value || ''));
}

function is_absolute_path(value) {
  return value.startsWith('/') || /^[a-zA-Z]:\//u.test(value);
}

function split_lines(value) {
  return String(value || '')
    .split(/\r?\n/u)
    .map((row) => row.trim())
    .filter(Boolean)
  ;
}

function get_obsidian_uri_file(row) {
  try {
    const url = new URL(row);
    return url.searchParams.get('file') || '';
  } catch (_) {
    const match = row.match(/file=([^&\s]+)/u);
    if (!match) return '';

    try {
      return decodeURIComponent(match[1]);
    } catch (_) {
      return match[1];
    }
  }
}

function add_entry(entries, seen, {
  raw_value,
  normalized_path,
  origin,
  kind_hint = null,
  appended_md = false,
}) {
  const path = normalize_path(normalized_path);
  if (!path) return;

  const entry = {
    raw_value: String(raw_value || ''),
    normalized_path: path,
    origin,
    kind_hint,
    appended_md,
  };
  const entry_key = [
    entry.normalized_path,
    entry.origin,
    entry.kind_hint || '',
    entry.appended_md ? '1' : '0',
  ].join('\u0000');

  if (seen.has(entry_key)) return;
  seen.add(entry_key);
  entries.push(entry);
}

function get_text_rows(data_transfer) {
  const rows = [
    ...split_lines(data_transfer?.getData?.('text/uri-list'))
      .map((value) => ({ value, origin: 'uri_list' })),
    ...split_lines(data_transfer?.getData?.('text/plain'))
      .map((value) => ({ value, origin: 'plain_text' })),
  ];
  const merged_rows = [];

  for (let row_i = 0; row_i < rows.length; row_i += 1) {
    const row = rows[row_i];
    const next_row = rows[row_i + 1];

    if (
      row.value.startsWith('obsidian:')
      && !row.value.startsWith('obsidian://')
      && next_row?.value?.startsWith('/')
    ) {
      merged_rows.push({
        value: row.value + next_row.value,
        origin: row.origin,
      });
      row_i += 1;
      continue;
    }

    merged_rows.push(row);
  }

  return merged_rows.flatMap((row) => {
    if (!row.value.startsWith('obsidian://')) return [row];

    return row.value
      .split(/(?=obsidian:\/\/)/gu)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({
        value,
        origin: row.origin,
      }))
    ;
  });
}

/**
 * Parse native drag data without discarding path provenance.
 *
 * @param {DataTransfer|object} data_transfer
 * @returns {Array<{
 *   raw_value:string,
 *   normalized_path:string,
 *   origin:string,
 *   kind_hint:'file'|'folder'|null,
 *   appended_md:boolean,
 * }>}
 */
export function parse_dropped_obsidian_entries(data_transfer) {
  const entries = [];
  const seen = new Set();

  if (data_transfer?.files?.length) {
    [...data_transfer.files].forEach((file) => {
      const file_path = file?.path || file?.name;
      if (!file_path) return;

      add_entry(entries, seen, {
        raw_value: file_path,
        normalized_path: file_path,
        origin: 'file_list',
        kind_hint: 'file',
      });
    });
  }

  get_text_rows(data_transfer).forEach(({ value, origin }) => {
    if (value.startsWith('obsidian://')) {
      const file_path = get_obsidian_uri_file(value);
      if (!file_path) return;

      const appended_md = !has_file_extension(file_path);
      add_entry(entries, seen, {
        raw_value: value,
        normalized_path: appended_md ? `${file_path}.md` : file_path,
        origin: 'obsidian_uri',
        kind_hint: 'file',
        appended_md,
      });
      return;
    }

    const kind_hint = /[\\/]$/u.test(value) ? 'folder' : null;
    const appended_md = kind_hint === null && !has_file_extension(value);

    add_entry(entries, seen, {
      raw_value: value,
      normalized_path: appended_md ? `${value}.md` : value,
      origin,
      kind_hint,
      appended_md,
    });
  });

  return entries;
}

/**
 * Convert one typed native entry into a vault-relative path.
 * Absolute paths fail closed when the active vault root is unavailable or the
 * path is outside that root.
 *
 * @param {object} entry
 * @param {string} [vault_path='']
 * @returns {string}
 */
export function get_dropped_obsidian_entry_path(entry, vault_path = '') {
  const entry_path = normalize_path(entry?.normalized_path);
  if (!entry_path) return '';
  if (!is_absolute_path(entry_path)) return entry_path.replace(/^\.\//u, '');

  const normalized_vault_path = normalize_path(vault_path);
  if (!normalized_vault_path || !is_absolute_path(normalized_vault_path)) {
    return '';
  }

  const case_insensitive = /^[a-zA-Z]:\//u.test(normalized_vault_path);
  const comparable_entry_path = case_insensitive
    ? entry_path.toLowerCase()
    : entry_path
  ;
  const comparable_vault_path = case_insensitive
    ? normalized_vault_path.toLowerCase()
    : normalized_vault_path
  ;
  const vault_prefix = comparable_vault_path.endsWith('/')
    ? comparable_vault_path
    : `${comparable_vault_path}/`
  ;

  if (!comparable_entry_path.startsWith(vault_prefix)) return '';

  return entry_path.slice(vault_prefix.length);
}

function normalize_paths(paths) {
  return Array.from(new Set(
    (Array.isArray(paths) ? paths : [])
      .map(normalize_path)
      .filter(Boolean),
  ));
}

function get_exact_candidates({
  original_path,
  inferred_file_path,
  file_paths,
  folder_paths,
}) {
  const candidates = [];

  if (file_paths.includes(original_path)) {
    candidates.push({
      status: 'exact',
      kind: 'file',
      path: original_path,
    });
  }
  if (folder_paths.includes(original_path)) {
    candidates.push({
      status: 'exact',
      kind: 'folder',
      path: original_path,
    });
  }
  if (
    inferred_file_path
    && inferred_file_path !== original_path
    && file_paths.includes(inferred_file_path)
  ) {
    candidates.push({
      status: 'recovered',
      kind: 'file',
      path: inferred_file_path,
    });
  }

  return candidates;
}

function get_recovered_candidates({
  original_path,
  inferred_file_path,
  file_paths,
  folder_paths,
}) {
  const candidates = [];
  const file_inputs = inferred_file_path
    ? [original_path, inferred_file_path]
    : [original_path]
  ;

  file_inputs.forEach((input_path) => {
    file_paths
      .filter((path) => path.endsWith(`/${input_path}`))
      .forEach((path) => candidates.push({
        status: 'recovered',
        kind: 'file',
        path,
      }))
    ;
  });

  folder_paths
    .filter((path) => path.endsWith(`/${original_path}`))
    .forEach((path) => candidates.push({
      status: 'recovered',
      kind: 'folder',
      path,
    }))
  ;

  const candidates_by_key = new Map();
  candidates.forEach((candidate) => {
    const key = `${candidate.kind}:${candidate.path}`;
    if (!candidates_by_key.has(key)) candidates_by_key.set(key, candidate);
  });

  return Array.from(candidates_by_key.values());
}

function get_matching_candidates(candidates, kind_hint) {
  return kind_hint
    ? candidates.filter((candidate) => candidate.kind === kind_hint)
    : candidates
  ;
}

function is_candidate_available(candidate, available_file_paths, available_folder_paths) {
  const available_paths = candidate.kind === 'folder'
    ? available_folder_paths
    : available_file_paths
  ;

  return available_paths.includes(candidate.path);
}

/**
 * Classify one native drop entry against known and target-available vault paths.
 *
 * @param {object} entry
 * @param {object} [options={}]
 * @param {string[]} [options.file_paths=[]]
 * @param {string[]} [options.folder_paths=[]]
 * @param {string[]} [options.available_file_paths]
 * @param {string[]} [options.available_folder_paths]
 * @param {string} [options.vault_path='']
 * @returns {{
 *   status:'exact'|'exact_unavailable'|'recovered'|'ambiguous'|'unresolved',
 *   kind:'file'|'folder'|null,
 *   path:string|null,
 * }}
 */
export function classify_dropped_obsidian_entry(entry, options = {}) {
  const file_paths = normalize_paths(options.file_paths);
  const folder_paths = normalize_paths(options.folder_paths);
  const available_file_paths = options.available_file_paths === undefined
    ? file_paths
    : normalize_paths(options.available_file_paths)
  ;
  const available_folder_paths = options.available_folder_paths === undefined
    ? folder_paths
    : normalize_paths(options.available_folder_paths)
  ;
  const entry_path = get_dropped_obsidian_entry_path(
    entry,
    options.vault_path,
  );

  if (!entry_path) {
    return {
      status: 'unresolved',
      kind: null,
      path: null,
    };
  }

  const appended_md = entry?.appended_md === true
    && entry_path.endsWith('.md')
  ;
  const original_path = appended_md
    ? entry_path.slice(0, -3)
    : entry_path
  ;
  const inferred_file_path = appended_md ? entry_path : '';
  const kind_hint = entry?.kind_hint === 'file'
    || entry?.kind_hint === 'folder'
    ? entry.kind_hint
    : null
  ;
  const exact_candidates = get_exact_candidates({
    original_path,
    inferred_file_path,
    file_paths,
    folder_paths,
  });

  if (exact_candidates.length) {
    const matching_candidates = get_matching_candidates(
      exact_candidates,
      kind_hint,
    );
    if (matching_candidates.length !== 1) {
      return {
        status: matching_candidates.length > 1 ? 'ambiguous' : 'unresolved',
        kind: null,
        path: null,
      };
    }
    const candidate = matching_candidates[0];

    return is_candidate_available(
      candidate,
      available_file_paths,
      available_folder_paths,
    )
      ? candidate
      : {
          status: 'exact_unavailable',
          kind: candidate.kind,
          path: candidate.path,
        }
    ;
  }

  const recovered_candidates = get_recovered_candidates({
    original_path,
    inferred_file_path,
    file_paths,
    folder_paths,
  });
  const matching_candidates = get_matching_candidates(
    recovered_candidates,
    kind_hint,
  );

  if (matching_candidates.length !== 1) {
    return {
      status: matching_candidates.length > 1 ? 'ambiguous' : 'unresolved',
      kind: null,
      path: null,
    };
  }
  const candidate = matching_candidates[0];

  return is_candidate_available(
    candidate,
    available_file_paths,
    available_folder_paths,
  )
    ? candidate
    : {
        status: 'exact_unavailable',
        kind: candidate.kind,
        path: candidate.path,
      }
  ;
}

/**
 * Compatibility parser returning deduplicated normalized paths.
 *
 * @param {DataTransfer|object} data_transfer
 * @returns {Set<string>}
 */
export function parse_dropped_obsidian_data(data_transfer) {
  return new Set(
    parse_dropped_obsidian_entries(data_transfer)
      .map((entry) => entry.normalized_path),
  );
}
