import { source_get_embed_input_markdown } from 'smart-sources/actions/get_embed_input/markdown.js';

export const display_name = 'Get Canvas source embed input';

/**
 * Canvas sources currently embed their normalized file content through the same
 * source-level shape as Markdown-like sources.
 *
 * @this {import('smart-sources').SmartSource}
 * @param {object} [params={}]
 * @returns {Promise<string>}
 */
export async function source_get_embed_input_canvas(params = {}) {
  return await source_get_embed_input_markdown.call(this, params);
}
