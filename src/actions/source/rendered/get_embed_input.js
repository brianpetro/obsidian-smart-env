export const display_name = 'Get rendered source embed input';

/**
 * Rendered sources currently embed their readable file content through the same
 * source-level shape as Markdown-like sources.
 *
 * @this {import('smart-sources').SmartSource}
 * @param {object} [params={}]
 * @returns {Promise<string>}
 */
export async function source_rendered_get_embed_input(params = {}) {
  return await this.actions.source_markdown_get_embed_input(params);
}
