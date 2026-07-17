export const display_name = 'Get Base source embed input';

/**
 * Bases sources are bookkeeping records; rendered Base view blocks are the
 * embedding units.
 *
 * @this {import('smart-sources').SmartSource}
 * @returns {Promise<string>}
 */
export async function source_get_embed_input_base() {
  this._embed_input = '';
  return '';
}
