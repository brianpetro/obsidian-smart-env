import {
  get_embeddings_file_info,
  has_current_embedding,
  yield_to_main_thread,
} from './env_stats.js';

const DEFAULT_YIELD_AFTER_MS = 10;
const YIELD_CHECK_INTERVAL = 64;

/**
 * Read a source once and build lightweight source-inspector records.
 *
 * Block content and embed inputs are intentionally omitted from the initial
 * pass. The UI materializes content only for visible or searched blocks and
 * generates embed inputs only when a user expands one.
 *
 * @param {object} source
 * @param {object} [params={}]
 * @param {(progress: object) => void} [params.on_progress]
 * @param {() => boolean} [params.is_cancelled]
 * @param {number} [params.yield_after_ms]
 * @returns {Promise<object>}
 */
export async function load_source_inspector_records(source, params = {}) {
  const {
    on_progress,
    is_cancelled,
    yield_after_ms = DEFAULT_YIELD_AFTER_MS,
  } = params;
  const started_at = now_ms();
  const previous_source_hash = get_item_read_hash(source);
  const raw_source_content = await source?.read?.();
  const source_content = typeof raw_source_content === 'string'
    ? raw_source_content
    : ''
  ;
  const current_source_hash = get_item_read_hash(source);
  const source_content_changed = (
    !previous_source_hash
    || !current_source_hash
    || previous_source_hash !== current_source_hash
  );
  const source_lines = source_content ? source_content.split('\n') : [];
  const source_blocks = source?.blocks;
  const blocks = Array.isArray(source_blocks)
    ? source_blocks.slice().sort(sort_blocks_by_line)
    : []
  ;
  const file_info_by_embeddings = new Map();
  const records = [];
  const summary = create_summary(blocks.length);
  let yielded_at = now_ms();

  for (let block_i = 0; block_i < blocks.length; block_i += 1) {
    if (is_cancelled?.()) break;

    const block = blocks[block_i];
    const should_embed = get_should_embed(block);
    const line_start = normalize_line_number(block?.line_start, 1);
    const line_end = Math.max(
      line_start,
      normalize_line_number(block?.line_end, line_start),
    );
    const persisted_size = Number(block?.size || 0);
    let current_size = Number.isFinite(persisted_size) ? persisted_size : 0;
    let read_hash_override;
    if (source_content_changed) {
      const current_content = extract_block_content(source_lines, {
        line_start,
        line_end,
      });
      current_size = current_content.length;
      read_hash_override = create_block_read_hash(block, current_content);
    }
    const vectorized = get_item_vectorized(
      block,
      file_info_by_embeddings,
      read_hash_override,
    );
    const status_key = get_embedding_status_key({ should_embed, vectorized });
    const record = {
      block,
      key: block?.key || '',
      display_name: get_block_display_name(block),
      line_start,
      line_end,
      size: current_size,
      content: null,
      content_loaded: false,
      search_text: null,
      should_embed,
      vectorized,
      status_key,
      embed_input: null,
      embed_input_loaded: false,
      embed_input_loading: false,
      embed_input_promise: null,
      embed_input_error: '',
    };

    records.push(record);
    summary.processed += 1;
    summary[status_key] += 1;
    if (should_embed) summary.should_embed += 1;
    else summary.should_not_embed += 1;
    if (vectorized) summary.vectorized += 1;

    if ((block_i + 1) % YIELD_CHECK_INTERVAL !== 0) continue;
    const current_time = now_ms();
    if (current_time - yielded_at < yield_after_ms) continue;

    on_progress?.({
      processed: summary.processed,
      total: summary.total,
    });
    await yield_to_main_thread();
    yielded_at = now_ms();
  }

  const source_should_embed = get_should_embed(source);
  const source_vectorized = get_item_vectorized(source, file_info_by_embeddings);

  return {
    source_content,
    source_lines,
    source_content_changed,
    line_count: source_lines.length,
    char_count: source_content.length,
    source_status: {
      should_embed: source_should_embed,
      vectorized: source_vectorized,
      status_key: get_embedding_status_key({
        should_embed: source_should_embed,
        vectorized: source_vectorized,
      }),
    },
    records,
    summary,
    load_time_ms: Math.max(0, Math.round(now_ms() - started_at)),
    cancelled: Boolean(is_cancelled?.()),
  };
}

/**
 * Extract one 1-indexed inclusive line range from source lines.
 *
 * @param {string[]} source_lines
 * @param {object} block
 * @returns {string}
 */
export function extract_block_content(source_lines = [], block = {}) {
  if (!Array.isArray(source_lines) || !source_lines.length) return '';

  const line_start = normalize_line_number(block.line_start, 1);
  const line_end = Math.max(
    line_start,
    normalize_line_number(block.line_end, line_start),
  );
  return source_lines.slice(line_start - 1, line_end).join('\n');
}

/**
 * Materialize and cache block content from an already-read source.
 *
 * @param {object} record
 * @param {string[]} source_lines
 * @returns {string}
 */
export function materialize_block_content(record, source_lines = []) {
  if (record?.content_loaded) return record.content || '';
  if (!record) return '';

  const content = extract_block_content(source_lines, record);
  record.content = content;
  record.content_loaded = true;
  record.size = content.length;
  return content;
}

/**
 * @param {object} block
 * @returns {string}
 */
export function get_block_display_name(block = {}) {
  const sub_key = String(block.sub_key || '');
  const block_key = String(block.key || '');
  const display_key = sub_key || block_key.split('#').slice(1).join('#');
  const segments = display_key
    .split('#')
    .map((segment) => segment.trim())
    .filter(Boolean)
  ;
  return segments.length ? segments.join(' > ') : 'Root block';
}

/**
 * @param {object} params
 * @param {boolean} params.should_embed
 * @param {boolean} params.vectorized
 * @returns {'embedded'|'missing'|'skipped'|'unexpected'}
 */
export function get_embedding_status_key({ should_embed, vectorized }) {
  if (should_embed && vectorized) return 'embedded';
  if (should_embed && !vectorized) return 'missing';
  if (!should_embed && vectorized) return 'unexpected';
  return 'skipped';
}

/**
 * @param {number} total
 * @returns {object}
 */
function create_summary(total = 0) {
  return {
    total,
    processed: 0,
    should_embed: 0,
    should_not_embed: 0,
    vectorized: 0,
    embedded: 0,
    missing: 0,
    skipped: 0,
    unexpected: 0,
  };
}

/**
 * @param {object} item
 * @param {Map<object, object|null>} file_info_by_embeddings
 * @param {string|undefined} [read_hash_override]
 * @returns {boolean}
 */
function get_item_vectorized(
  item,
  file_info_by_embeddings,
  read_hash_override,
) {
  const embeddings = item?.collection?.embeddings;
  if (!embeddings) return false;

  if (!file_info_by_embeddings.has(embeddings)) {
    file_info_by_embeddings.set(
      embeddings,
      get_embeddings_file_info(embeddings),
    );
  }
  return has_current_embedding(
    item,
    embeddings,
    file_info_by_embeddings.get(embeddings),
    read_hash_override,
  );
}

/**
 * Compute the same content hash a block read would produce without rereading
 * the source or mutating persisted block metadata.
 *
 * @param {object} block
 * @param {string} content
 * @returns {string|undefined}
 */
function create_block_read_hash(block, content) {
  try {
    const hash = block?.block_adapter?.create_hash?.(content);
    return typeof hash === 'string' && hash ? hash : undefined;
  } catch (error) {
    console.warn('[source_inspector] Failed to hash block content', block?.key, error);
    return undefined;
  }
}

/**
 * @param {object} item
 * @returns {string}
 */
function get_item_read_hash(item) {
  try {
    return item?.data?.last_read?.hash || '';
  } catch {
    return '';
  }
}

/**
 * @param {object} item
 * @returns {boolean}
 */
function get_should_embed(item) {
  try {
    return Boolean(item?.should_embed);
  } catch (error) {
    console.warn('[source_inspector] Failed to evaluate should_embed', item?.key, error);
    return false;
  }
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function sort_blocks_by_line(a, b) {
  const line_delta = Number(a?.line_start || 0) - Number(b?.line_start || 0);
  if (line_delta) return line_delta;
  return String(a?.key || '').localeCompare(String(b?.key || ''));
}

/**
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function normalize_line_number(value, fallback) {
  const line_number = Number(value);
  if (!Number.isFinite(line_number) || line_number < 1) return fallback;
  return Math.floor(line_number);
}

/**
 * @returns {number}
 */
function now_ms() {
  return globalThis.performance?.now?.() || Date.now();
}
