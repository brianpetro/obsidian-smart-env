export const display_name = 'Get Canvas source embed input';

/**
 * Canvas sources currently embed their normalized file content through the same
 * source-level shape as Markdown-like sources.
 *
 * @this {import('smart-sources').SmartSource}
 * @param {object} [params={}]
 * @returns {Promise<string>}
 */
export async function source_canvas_get_embed_input(params = {}) {
  return await this.actions.source_markdown_get_embed_input(params);
}
