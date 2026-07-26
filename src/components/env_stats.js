/**
 * env_stats.js
 *
 * A standalone component that displays stats for every collection in `env.collections`,
 * and calculates embedding coverage in a more consistent, clearer way.
 *
 * Exported functions:
 *  - build_html(env, opts) => string of HTML
 *  - render(env, opts) => DocumentFragment
 *  - post_process(env, frag, opts) => DocumentFragment
 *  - calculate_embed_coverage(itemArr) => { needed, embedded, percent, display }
 */

import { run_action_entry } from "smart-environment/utils/action_entry.js";
import { convert_to_human_readable_size } from "smart-utils/convert_to_human_readable_size.js";
import { format_collection_name } from "../utils/format_collection_name.js";

export async function build_html(env, opts = {}) {
  const lines = [];
  const {
    used_bytes,
    allocated_bytes,
    unused_capacity_bytes,
  } = await run_action_entry(
    env,
    'env_get_embedding_vector_memory_usage',
  );
  lines.push(`<h2>Embedding vector memory</h2>`);
  lines.push(`<p><strong>Used:</strong> ${convert_to_human_readable_size(used_bytes)} (${used_bytes} bytes)</p>`);
  lines.push(`<p><strong>Allocated:</strong> ${convert_to_human_readable_size(allocated_bytes)} (${allocated_bytes} bytes)</p>`);
  lines.push(`<p><strong>Unused capacity:</strong> ${convert_to_human_readable_size(unused_capacity_bytes)} (${unused_capacity_bytes} bytes)</p>`);
  lines.push(`<h2>Collections</h2>`);

  const collection_keys = Object.keys(env.collections)
    .filter(key => ['smart_sources', 'smart_blocks'].includes(key))
    // sort smart_sources and smart_blocks first
    .sort((a, b) => {
      if (a === 'smart_sources' || a === 'smart_blocks') return -1;
      if (b === 'smart_sources' || b === 'smart_blocks') return 1;
      return a.localeCompare(b);
    })
  ;
  // For each collection, produce a stats snippet
  for (const collection_key of collection_keys) {
    const collection = env[collection_key];
    if (!collection || !collection.items) {
      lines.push(`
        <div class="sc-collection-stats">
          <h3>${format_collection_name(collection_key)}</h3>
          <p>No valid items.</p>
        </div>
      `);
      continue;
    }
    const snippet = generate_collection_stats(collection, collection_key);
    lines.push(snippet);
  }

  return `
    <div class="sc-env-stats-container" style="user-select: text;">
      ${lines.join("\n")}
    </div>
  `;
}

export async function render(env, opts = {}) {
  const html = await build_html.call(this, env, opts);
  const frag = this.create_doc_fragment(html);
  return await post_process.call(this, env, frag, opts);
}

export async function post_process(env, frag, opts = {}) {
  return frag;
}

function generate_collection_stats(collection, collectionKey) {
  const total_items = Object.values(collection.items).length;
  const niceName = format_collection_name(collectionKey);
  const state = collection.env.collections[collectionKey];

  // If not loaded
  if (state !== 'loaded') {
    return `
      <div class="sc-collection-stats">
        <h3>${niceName}</h3>
        <p>Not loaded yet (${total_items} items known).</p>
      </div>
    `;
  }
  const load_time_html = collection.load_time_ms ? `<p>Load time: ${collection.load_time_ms}ms</p>` : '';
  const state_html = `<p>State: ${state}</p>`;

  // Distinguish "smart_sources" / "smart_blocks" / fallback
  let html = get_generic_collection_stats(collection, niceName, total_items, );
  let embed_stats = '';
  if(typeof collection.process_embed_queue === 'function') {
    embed_stats = calculate_embed_coverage(collection, total_items);
  }
  return `
    <div class="sc-collection-stats">
      <h3>${niceName}</h3>
      ${embed_stats}
      ${html}
      ${load_time_html}
      ${state_html}
    </div>
  `;
}

function get_generic_collection_stats(collection, niceName, total_items, load_time_html) {
  return `
      <p><strong>Total:</strong> ${total_items}</p>
  `;
}
export function calculate_embed_coverage(collection, total_items) {
  const embedded_items = Object.values(collection.items).filter(item => item.vec);
  if(!embedded_items.length) return '<p>No items embedded</p>';
  const stats = Object.values(collection.items).reduce((acc, i) => {
    if(i.should_embed) acc.should_embed += 1;
    else acc.should_not_embed += 1;
    if(i.vec) acc.embedded += 1;
    if(i.should_embed && !i.vec) acc.missing_embed += 1;
    if(!i.should_embed && i.vec) acc.extraneous_embed += 1;
    return acc;
  }, {should_embed: 0, embedded: 0, missing_embed: 0, extraneous_embed: 0, should_not_embed: 0});
  const pct = (stats.embedded / stats.should_embed) * 100;
  const percent = Math.round(pct);
  return `<p><strong>Embedding coverage:</strong> ${percent}% (${stats.embedded} / ${stats.should_embed})</p>`
    + (stats.missing_embed ? `<p><strong>Missing embeddings:</strong> ${stats.missing_embed}</p>` : '')
    + (stats.extraneous_embed ? `<p><strong>Extraneous embeddings:</strong> ${stats.extraneous_embed}</p>` : '')
    + (stats.should_not_embed ? `<p><strong>Other items (e.g. less than minimum length to embed):</strong> ${stats.should_not_embed}</p>` : '')
  ;
}


