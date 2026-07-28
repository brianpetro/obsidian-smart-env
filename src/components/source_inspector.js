import inspector_css from './source_inspector.css';
import { copy_to_clipboard } from '../utils/copy_to_clipboard.js';
import {
  load_source_inspector_records,
  materialize_block_content,
} from '../actions/env/inspect_active_note.js';
import { yield_to_main_thread } from '../utils/embedding_diagnostics.js';

const PAGE_SIZE = 30;
const BLOCK_PREVIEW_CHAR_LIMIT = 4000;
const SEARCH_DEBOUNCE_MS = 120;
const FILTER_YIELD_AFTER_MS = 10;
const FILTER_YIELD_INTERVAL = 64;
const number_formatter = new Intl.NumberFormat();

const STATUS_PRESENTATION = {
  embedded: {
    label: 'Current',
    description: 'Eligible and embedded for the current content.',
  },
  missing: {
    label: 'Needs embedding',
    description: 'Eligible, but no current embedding is available.',
  },
  skipped: {
    label: 'Skipped',
    description: 'Not currently eligible for embedding.',
  },
  unexpected: {
    label: 'Unexpected vector',
    description: 'Not eligible, but a current vector is still present.',
  },
};

/**
 * Build an immediately visible source-inspector shell.
 *
 * @returns {string}
 */
export function build_html() {
  return `<section class="source-inspector" aria-busy="true">
    <header class="source-inspector__header">
      <div class="source-inspector__heading">
        <div class="source-inspector__eyebrow">Source diagnostics</div>
        <p class="source-inspector__path" data-source-path></p>
        <div class="source-inspector__source-status">
          <span class="source-inspector__badge" data-source-status data-tone="loading">Analyzing...</span>
          <span data-source-status-detail aria-live="polite">Reading source once...</span>
        </div>
      </div>
      <div class="source-inspector__header-actions">
        <button type="button" data-action="open-source">Open note</button>
        <button type="button" data-action="refresh">Refresh</button>
      </div>
    </header>

    <div class="source-inspector__summary" aria-label="Source summary">
      ${build_metric_html('blocks', 'Blocks')}
      ${build_metric_html('characters', 'Characters')}
      ${build_metric_html('lines', 'Lines')}
      ${build_metric_html('coverage', 'Block coverage')}
    </div>

    <details class="source-inspector__source-data">
      <summary>
        <span>Source data</span>
        <span class="source-inspector__source-data-hint">Loaded only when expanded</span>
      </summary>
      <div class="source-inspector__source-data-toolbar">
        <button type="button" data-action="copy-source-data">Copy JSON</button>
      </div>
      <pre data-source-data>Expand to inspect persisted source metadata.</pre>
    </details>

    <section class="source-inspector__blocks-section">
      <div class="source-inspector__section-heading">
        <div>
          <h3>Blocks</h3>
          <p data-blocks-detail>Preparing block diagnostics...</p>
        </div>
        <div class="source-inspector__timing" data-load-timing></div>
      </div>

      <div class="source-inspector__toolbar">
        <label class="source-inspector__search">
          <span>Search blocks</span>
          <input type="search" data-block-search placeholder="Heading or content" autocomplete="off">
        </label>
        <div class="source-inspector__filters" role="group" aria-label="Filter blocks by embedding status">
          ${build_filter_button_html('all', 'All')}
          ${build_filter_button_html('missing', 'Needs embedding')}
          ${build_filter_button_html('embedded', 'Current')}
          ${build_filter_button_html('skipped', 'Skipped')}
          ${build_filter_button_html('unexpected', 'Unexpected')}
        </div>
      </div>

      <div class="source-inspector__results" data-results-summary aria-live="polite">Loading blocks...</div>
      <div class="source-inspector__blocks-container" data-blocks-container>
        ${build_loading_html('Reading source and indexing block metadata...')}
      </div>
      <button class="source-inspector__load-more" type="button" data-action="load-more" hidden>Show more</button>
    </section>
  </section>`;
}

/**
 * @param {object} source
 * @param {object} [opts]
 * @returns {Promise<HTMLElement>}
 */
export async function render(source, opts = {}) {
  this.apply_style_sheet(inspector_css);
  const frag = this.create_doc_fragment(build_html(source, opts));
  const container = frag.firstElementChild;
  post_process.call(this, source, container, opts);
  return container;
}

/**
 * Bind controls and hydrate the inspector after the shell can paint.
 *
 * @param {object} source
 * @param {HTMLElement} container
 * @param {object} [opts]
 * @returns {HTMLElement}
 */
export function post_process(source, container, opts = {}) {
  if (!container) return container;

  const elements = get_elements(container);
  const state = {
    active_filter: 'all',
    disposed: false,
    filtered_records: [],
    filter_id: 0,
    load_id: 0,
    load_result: null,
    query: '',
    search_timeout: null,
    start_timeout: null,
    visible_count: PAGE_SIZE,
  };
  const cleanup_fns = [];

  set_text(elements.source_path, source?.path || source?.key || 'Unknown source');
  if (typeof source?.open !== 'function') elements.open_source_btn.hidden = true;

  const refresh = async () => {
    const current_load_id = ++state.load_id;
    state.filter_id += 1;
    state.load_result = null;
    state.filtered_records = [];
    state.visible_count = PAGE_SIZE;
    delete elements.source_data_pre.dataset.loaded;
    elements.source_data_pre.textContent = elements.source_data_details.open
      ? 'Refreshing source data...'
      : 'Expand to inspect persisted source metadata.'
    ;
    elements.source_status.dataset.tone = 'loading';
    set_text(elements.source_status, 'Analyzing...');
    set_text(elements.source_status_detail, 'Reading source once...');
    set_text(elements.results_summary, 'Loading blocks...');
    elements.blocks_container.innerHTML = build_loading_html(
      'Reading source and indexing block metadata...',
    );
    elements.load_more_btn.hidden = true;
    set_loading_state(container, elements, true);

    try {
      const result = await load_source_inspector_records(source, {
        is_cancelled: () => state.disposed || current_load_id !== state.load_id,
        on_progress: ({ processed, total }) => {
          if (state.disposed || current_load_id !== state.load_id) return;
          set_text(
            elements.source_status_detail,
            `Analyzing block ${format_number(processed)} of ${format_number(total)}...`,
          );
          set_text(
            elements.results_summary,
            `Analyzing ${format_number(processed)} of ${format_number(total)} blocks...`,
          );
        },
      });

      if (
        state.disposed
        || current_load_id !== state.load_id
        || result.cancelled
      ) {
        return;
      }

      state.load_result = result;
      render_source_summary(elements, result);
      render_filter_counts(elements.filters, result.summary);
      if (elements.source_data_details.open) render_source_data(source, elements);
      await apply_filters(container, elements, state);
      if (state.disposed || current_load_id !== state.load_id) return;
      set_loading_state(container, elements, false);
    } catch (error) {
      if (state.disposed || current_load_id !== state.load_id) return;
      console.error('[source_inspector] Failed to inspect source', error);
      render_error(elements, error);
      set_loading_state(container, elements, false);
    }
  };

  const handle_refresh = () => {
    if (state.start_timeout) {
      clearTimeout(state.start_timeout);
      state.start_timeout = null;
    }
    refresh().catch((error) => {
      if (state.disposed) return;
      console.error('[source_inspector] Failed to refresh source inspector', error);
      render_error(elements, error);
      set_loading_state(container, elements, false);
    });
  };

  const handle_open_source = () => {
    try {
      source?.open?.();
    } catch (error) {
      console.error('[source_inspector] Failed to open source', error);
      set_text(elements.source_status_detail, 'Failed to open this note.');
    }
  };

  const handle_search_input = (event) => {
    state.query = String(event.currentTarget?.value || '').trim().toLowerCase();
    if (state.search_timeout) clearTimeout(state.search_timeout);
    state.search_timeout = setTimeout(() => {
      state.search_timeout = null;
      state.visible_count = PAGE_SIZE;
      apply_filters(container, elements, state).catch((error) => {
        if (state.disposed) return;
        console.error('[source_inspector] Failed to search blocks', error);
        render_error(elements, error);
      });
    }, SEARCH_DEBOUNCE_MS);
  };

  const handle_filter_click = (event) => {
    const button = event.target?.closest?.('[data-filter]');
    if (!button || !elements.filters.contains(button)) return;
    state.active_filter = button.dataset.filter || 'all';
    state.visible_count = PAGE_SIZE;
    update_active_filter(elements.filters, state.active_filter);
    apply_filters(container, elements, state).catch((error) => {
      if (state.disposed) return;
      console.error('[source_inspector] Failed to filter blocks', error);
      render_error(elements, error);
    });
  };

  const handle_load_more = () => {
    state.visible_count += PAGE_SIZE;
    render_blocks(container, elements, state);
  };

  const handle_source_data_toggle = () => {
    if (!elements.source_data_details.open) return;
    render_source_data(source, elements);
  };

  const handle_copy_source_data = async () => {
    const json = get_source_data_json(source, elements);
    await copy_with_feedback(
      json,
      elements.copy_source_data_btn,
      source?.env,
      'Copy JSON',
    );
  };

  bind_event(elements.refresh_btn, 'click', handle_refresh, cleanup_fns);
  bind_event(elements.open_source_btn, 'click', handle_open_source, cleanup_fns);
  bind_event(elements.search_input, 'input', handle_search_input, cleanup_fns);
  bind_event(elements.filters, 'click', handle_filter_click, cleanup_fns);
  bind_event(elements.load_more_btn, 'click', handle_load_more, cleanup_fns);
  bind_event(elements.source_data_details, 'toggle', handle_source_data_toggle, cleanup_fns);
  bind_event(elements.copy_source_data_btn, 'click', handle_copy_source_data, cleanup_fns);

  state.start_timeout = setTimeout(() => {
    state.start_timeout = null;
    handle_refresh();
  }, 0);

  this.attach_disposer?.(container, () => {
    state.disposed = true;
    state.load_id += 1;
    state.filter_id += 1;
    if (state.start_timeout) clearTimeout(state.start_timeout);
    if (state.search_timeout) clearTimeout(state.search_timeout);
    cleanup_fns.forEach((cleanup) => cleanup());
  });

  return container;
}

/**
 * @param {HTMLElement} container
 * @returns {object}
 */
function get_elements(container) {
  return {
    blocks_container: container.querySelector('[data-blocks-container]'),
    blocks_detail: container.querySelector('[data-blocks-detail]'),
    copy_source_data_btn: container.querySelector('[data-action="copy-source-data"]'),
    filters: container.querySelector('.source-inspector__filters'),
    load_more_btn: container.querySelector('[data-action="load-more"]'),
    load_timing: container.querySelector('[data-load-timing]'),
    open_source_btn: container.querySelector('[data-action="open-source"]'),
    refresh_btn: container.querySelector('[data-action="refresh"]'),
    results_summary: container.querySelector('[data-results-summary]'),
    search_input: container.querySelector('[data-block-search]'),
    source_data_details: container.querySelector('.source-inspector__source-data'),
    source_data_pre: container.querySelector('[data-source-data]'),
    source_path: container.querySelector('[data-source-path]'),
    source_status: container.querySelector('[data-source-status]'),
    source_status_detail: container.querySelector('[data-source-status-detail]'),
  };
}

/**
 * Filter records without monopolizing the main thread when a source has many
 * blocks or content search needs to materialize large ranges.
 *
 * @param {HTMLElement} container
 * @param {object} elements
 * @param {object} state
 * @returns {Promise<void>}
 */
async function apply_filters(container, elements, state) {
  if (!state.load_result) return;

  const current_filter_id = ++state.filter_id;
  const records = state.load_result.records || [];
  const source_lines = state.load_result.source_lines || [];
  const query = state.query;
  const active_filter = state.active_filter;
  const filtered_records = [];
  let yielded_at = now_ms();

  set_text(
    elements.results_summary,
    query ? 'Searching block content...' : 'Applying filter...',
  );
  elements.load_more_btn.hidden = true;

  for (let record_i = 0; record_i < records.length; record_i += 1) {
    if (state.disposed || current_filter_id !== state.filter_id) return;
    const record = records[record_i];
    const matches_filter = (
      active_filter === 'all'
      || record.status_key === active_filter
    );
    const matches_query = (
      matches_filter
      && (
        !query
        || record_matches_query(record, source_lines, query)
      )
    );
    if (matches_filter && matches_query) filtered_records.push(record);

    if ((record_i + 1) % FILTER_YIELD_INTERVAL !== 0) continue;
    const current_time = now_ms();
    if (current_time - yielded_at < FILTER_YIELD_AFTER_MS) continue;
    await yield_to_main_thread();
    yielded_at = now_ms();
  }

  if (state.disposed || current_filter_id !== state.filter_id) return;
  state.filtered_records = filtered_records;
  render_blocks(container, elements, state);
}

/**
 * @param {object} record
 * @param {string[]} source_lines
 * @param {string} query
 * @returns {boolean}
 */
function record_matches_query(record, source_lines, query) {
  if (!query) return true;
  if (!record.search_text) {
    const content = materialize_block_content(record, source_lines);
    record.search_text = `${record.display_name}\n${record.key}\n${content}`.toLowerCase();
  }
  return record.search_text.includes(query);
}

/**
 * @param {HTMLElement} container
 * @param {object} elements
 * @param {object} state
 * @returns {void}
 */
function render_blocks(container, elements, state) {
  const records = state.filtered_records || [];
  const visible_records = records.slice(0, state.visible_count);
  elements.blocks_container.replaceChildren();

  if (!visible_records.length) {
    const empty = container.ownerDocument.createElement('div');
    empty.className = 'source-inspector__empty';
    const total_count = Number(state.load_result?.summary?.total || 0);
    empty.textContent = !total_count
      ? 'This source has no indexed blocks.'
      : state.query
        ? 'No blocks match this search and filter.'
        : 'No blocks match this filter.'
    ;
    elements.blocks_container.appendChild(empty);
  } else {
    const fragment = container.ownerDocument.createDocumentFragment();
    visible_records.forEach((record) => {
      fragment.appendChild(create_block_card(
        container.ownerDocument,
        record,
        state.load_result.source_lines || [],
        state.load_result,
      ));
    });
    elements.blocks_container.appendChild(fragment);
  }

  const visible_count = Math.min(visible_records.length, records.length);
  const total_count = Number(state.load_result?.summary?.total || 0);
  const is_unfiltered = (
    records.length === total_count
    && !state.query
    && state.active_filter === 'all'
  );
  let results_text;
  if (is_unfiltered) {
    results_text = records.length > visible_count
      ? `Showing ${format_number(visible_count)} of ${format_number(total_count)} blocks`
      : `${format_number(total_count)} blocks`
    ;
  } else {
    results_text = records.length > visible_count
      ? `Showing ${format_number(visible_count)} of ${format_number(records.length)} matches (${format_number(total_count)} total)`
      : `${format_number(records.length)} matches (${format_number(total_count)} total)`
    ;
  }
  set_text(elements.results_summary, results_text);

  elements.load_more_btn.hidden = visible_count >= records.length;
  if (!elements.load_more_btn.hidden) {
    const remaining = records.length - visible_count;
    elements.load_more_btn.textContent = `Show ${format_number(Math.min(PAGE_SIZE, remaining))} more`;
  }
}

/**
 * @param {Document} document_ref
 * @param {object} record
 * @param {string[]} source_lines
 * @param {object} load_result
 * @returns {HTMLElement}
 */
function create_block_card(document_ref, record, source_lines, load_result) {
  const presentation = STATUS_PRESENTATION[record.status_key] || STATUS_PRESENTATION.skipped;
  const content = materialize_block_content(record, source_lines);
  const content_is_truncated = content.length > BLOCK_PREVIEW_CHAR_LIMIT;
  const preview_content = content_is_truncated
    ? `${content.slice(0, BLOCK_PREVIEW_CHAR_LIMIT)}\n\n... ${format_number(content.length - BLOCK_PREVIEW_CHAR_LIMIT)} more characters`
    : content
  ;
  const article = document_ref.createElement('article');
  article.className = 'source-inspector__block';
  article.dataset.tone = record.status_key;

  const header = document_ref.createElement('header');
  header.className = 'source-inspector__block-header';

  const identity = document_ref.createElement('div');
  identity.className = 'source-inspector__block-identity';
  const title = document_ref.createElement('h4');
  title.textContent = record.display_name;
  const metadata = document_ref.createElement('div');
  metadata.className = 'source-inspector__block-metadata';
  metadata.textContent = `${format_number(record.size)} chars / lines ${record.line_start}-${record.line_end}`;
  identity.append(title, metadata);

  const actions = document_ref.createElement('div');
  actions.className = 'source-inspector__block-actions';
  const badge = document_ref.createElement('span');
  badge.className = 'source-inspector__badge';
  badge.dataset.tone = record.status_key;
  badge.title = presentation.description;
  badge.textContent = presentation.label;
  const copy_btn = document_ref.createElement('button');
  copy_btn.type = 'button';
  copy_btn.textContent = 'Copy';
  copy_btn.addEventListener('click', () => {
    copy_with_feedback(
      content,
      copy_btn,
      record.block?.env || record.block?.collection?.env,
      'Copy',
    );
  });
  actions.append(badge, copy_btn);
  header.append(identity, actions);

  const content_pre = document_ref.createElement('pre');
  content_pre.className = 'source-inspector__block-content';
  content_pre.textContent = preview_content || '(Empty block)';

  let full_content_details = null;
  if (content_is_truncated) {
    full_content_details = document_ref.createElement('details');
    full_content_details.className = 'source-inspector__full-content';
    const full_content_summary = document_ref.createElement('summary');
    full_content_summary.textContent = `Full block content (${format_number(content.length)} chars)`;
    const full_content_pre = document_ref.createElement('pre');
    full_content_pre.textContent = 'Expand to render the complete block content.';
    full_content_details.append(full_content_summary, full_content_pre);
    full_content_details.addEventListener('toggle', () => {
      if (!full_content_details.open || full_content_pre.dataset.loaded) return;
      full_content_pre.dataset.loaded = 'true';
      full_content_pre.textContent = content;
    });
  }

  const embed_details = document_ref.createElement('details');
  embed_details.className = 'source-inspector__embed-input';
  const embed_summary = document_ref.createElement('summary');
  embed_summary.textContent = 'Embed input';
  const embed_pre = document_ref.createElement('pre');
  embed_pre.textContent = 'Expand to generate this block embed input.';
  embed_details.append(embed_summary, embed_pre);
  embed_details.addEventListener('toggle', () => {
    if (!embed_details.open) return;
    load_embed_input(record, embed_pre, load_result).catch((error) => {
      console.error('[source_inspector] Failed to generate embed input', error);
    });
  });

  article.append(header, content_pre);
  if (full_content_details) article.append(full_content_details);
  article.append(embed_details);
  return article;
}

/**
 * @param {object} record
 * @param {HTMLElement} embed_pre
 * @param {object} load_result
 * @returns {Promise<void>}
 */
async function load_embed_input(record, embed_pre, load_result) {
  if (!record.embed_input_loaded && !record.embed_input_promise) {
    record.embed_input_loading = true;
    record.embed_input_promise = (async () => {
      try {
        const content = materialize_block_content(
          record,
          load_result?.source_lines || [],
        );
        const embed_input = await record.block?.get_embed_input?.(content);
        record.embed_input = typeof embed_input === 'string'
          ? embed_input
          : String(embed_input ?? '')
        ;
        record.embed_input_error = '';
      } catch (error) {
        record.embed_input = '';
        record.embed_input_error = error?.message || String(error);
      } finally {
        record.embed_input_loading = false;
        record.embed_input_loaded = true;
      }
    })();
  }

  if (!record.embed_input_loaded) {
    embed_pre.textContent = 'Generating embed input...';
    await record.embed_input_promise;
  }

  embed_pre.textContent = record.embed_input_error
    ? `Failed to generate embed input: ${record.embed_input_error}`
    : record.embed_input || '(Empty embed input)'
  ;
}


/**
 * @param {object} elements
 * @param {object} result
 * @returns {void}
 */
function render_source_summary(elements, result) {
  const presentation = STATUS_PRESENTATION[result.source_status?.status_key]
    || STATUS_PRESENTATION.skipped
  ;
  elements.source_status.dataset.tone = result.source_status?.status_key || 'skipped';
  set_text(elements.source_status, presentation.label);
  set_text(elements.source_status_detail, presentation.description);

  set_metric(elements, 'blocks', result.summary?.total, `${format_number(result.summary?.should_embed)} eligible`);
  set_metric(elements, 'characters', result.char_count, '');
  set_metric(elements, 'lines', result.line_count, '');

  const eligible = Number(result.summary?.should_embed || 0);
  const embedded = Number(result.summary?.embedded || 0);
  const coverage_percent = eligible ? Math.round((embedded / eligible) * 100) : null;
  set_metric(
    elements,
    'coverage',
    coverage_percent == null ? 'N/A' : `${coverage_percent}%`,
    eligible
      ? `${format_number(embedded)} of ${format_number(eligible)} eligible`
      : 'No eligible blocks',
  );

  set_text(
    elements.blocks_detail,
    `${format_number(result.summary?.missing)} need embedding / ${format_number(result.summary?.unexpected)} unexpected`,
  );
  set_text(elements.load_timing, `Loaded in ${format_duration(result.load_time_ms)}`);
}

/**
 * @param {object} elements
 * @param {string} key
 * @param {*} value
 * @param {string} detail
 * @returns {void}
 */
function set_metric(elements, key, value, detail) {
  const metric = elements.source_path
    ?.closest('.source-inspector')
    ?.querySelector(`[data-metric="${key}"]`)
  ;
  if (!metric) return;
  set_text(metric.querySelector('.source-inspector__metric-value'), format_number_or_text(value));
  set_text(metric.querySelector('.source-inspector__metric-detail'), detail);
}

/**
 * @param {HTMLElement} filters
 * @param {object} summary
 * @returns {void}
 */
function render_filter_counts(filters, summary = {}) {
  const counts = {
    all: summary.total,
    embedded: summary.embedded,
    missing: summary.missing,
    skipped: summary.skipped,
    unexpected: summary.unexpected,
  };
  Object.entries(counts).forEach(([filter_key, count]) => {
    const count_el = filters.querySelector(`[data-filter="${filter_key}"] [data-filter-count]`);
    set_text(count_el, format_number(count));
  });
}

/**
 * @param {HTMLElement} filters
 * @param {string} active_filter
 * @returns {void}
 */
function update_active_filter(filters, active_filter) {
  filters.querySelectorAll('[data-filter]').forEach((button) => {
    const is_active = button.dataset.filter === active_filter;
    button.classList.toggle('is-active', is_active);
    button.setAttribute('aria-pressed', String(is_active));
  });
}

/**
 * @param {HTMLElement} container
 * @param {object} elements
 * @param {boolean} loading
 * @returns {void}
 */
function set_loading_state(container, elements, loading) {
  container.setAttribute('aria-busy', String(loading));
  elements.refresh_btn.disabled = loading;
  elements.refresh_btn.textContent = loading ? 'Refreshing...' : 'Refresh';
  elements.search_input.disabled = loading;
  elements.filters.querySelectorAll('button').forEach((button) => {
    button.disabled = loading;
  });
}

/**
 * @param {object} elements
 * @param {Error} error
 * @returns {void}
 */
function render_error(elements, error) {
  const message = error?.message || 'Unknown error';
  elements.source_status.dataset.tone = 'missing';
  set_text(elements.source_status, 'Failed');
  set_text(elements.source_status_detail, 'Could not inspect this source.');
  set_text(elements.results_summary, 'Source inspection failed.');
  elements.blocks_container.replaceChildren();
  const error_el = elements.blocks_container.ownerDocument.createElement('div');
  error_el.className = 'source-inspector__error';
  error_el.textContent = `${message}. See the developer console for details.`;
  elements.blocks_container.appendChild(error_el);
  elements.load_more_btn.hidden = true;
}

/**
 * @param {object} source
 * @param {object} elements
 * @returns {void}
 */
function render_source_data(source, elements) {
  const json = get_source_data_json(source, elements);
  elements.source_data_pre.textContent = json;
}

/**
 * @param {object} source
 * @param {object} elements
 * @returns {string}
 */
function get_source_data_json(source, elements) {
  if (elements.source_data_pre.dataset.loaded === 'true') {
    return elements.source_data_pre.textContent || '';
  }

  let json;
  try {
    json = JSON.stringify(source?.data ?? {}, null, 2);
  } catch (error) {
    json = `Unable to serialize source data: ${error?.message || String(error)}`;
  }
  elements.source_data_pre.dataset.loaded = 'true';
  elements.source_data_pre.textContent = json;
  return json;
}

/**
 * @param {string} text
 * @param {HTMLButtonElement} button
 * @param {object} env
 * @param {string} idle_label
 * @returns {Promise<boolean>}
 */
async function copy_with_feedback(text, button, env, idle_label) {
  const copied = await copy_to_clipboard(text, {
    env,
    event_source: 'source_inspector',
  });
  if (!button?.isConnected) return copied;

  button.textContent = copied ? 'Copied' : 'Copy failed';
  setTimeout(() => {
    if (button?.isConnected) button.textContent = idle_label;
  }, 1200);
  return copied;
}

/**
 * @param {HTMLElement|null} element
 * @param {string} event_name
 * @param {Function} handler
 * @param {Function[]} cleanup_fns
 * @returns {void}
 */
function bind_event(element, event_name, handler, cleanup_fns) {
  if (!element) return;
  element.addEventListener(event_name, handler);
  cleanup_fns.push(() => element.removeEventListener(event_name, handler));
}

/**
 * @param {string} key
 * @param {string} label
 * @returns {string}
 */
function build_metric_html(key, label) {
  return `<div class="source-inspector__metric" data-metric="${key}">
    <div class="source-inspector__metric-label">${label}</div>
    <div class="source-inspector__metric-value">-</div>
    <div class="source-inspector__metric-detail"></div>
  </div>`;
}

/**
 * @param {string} key
 * @param {string} label
 * @returns {string}
 */
function build_filter_button_html(key, label) {
  const is_active = key === 'all';
  return `<button type="button" data-filter="${key}" aria-pressed="${is_active}" class="${is_active ? 'is-active' : ''}">
    <span>${label}</span>
    <span class="source-inspector__filter-count" data-filter-count>-</span>
  </button>`;
}

/**
 * @param {string} message
 * @returns {string}
 */
function build_loading_html(message) {
  return `<div class="source-inspector__loading">
    <span class="source-inspector__spinner" aria-hidden="true"></span>
    <span>${message}</span>
  </div>`;
}

/**
 * @param {HTMLElement|null} element
 * @param {*} value
 * @returns {void}
 */
function set_text(element, value) {
  if (!element) return;
  element.textContent = value == null ? '' : String(value);
}

/**
 * @param {*} value
 * @returns {string}
 */
function format_number(value) {
  return number_formatter.format(Number(value || 0));
}

/**
 * @param {*} value
 * @returns {string}
 */
function format_number_or_text(value) {
  return typeof value === 'number' ? format_number(value) : String(value ?? '');
}

/**
 * @param {number} duration_ms
 * @returns {string}
 */
function format_duration(duration_ms) {
  const normalized_ms = Math.max(0, Number(duration_ms || 0));
  if (normalized_ms < 1000) return `${Math.round(normalized_ms)} ms`;
  return `${(normalized_ms / 1000).toFixed(normalized_ms < 10000 ? 1 : 0)} s`;
}

/**
 * @returns {number}
 */
function now_ms() {
  return globalThis.performance?.now?.() || Date.now();
}
