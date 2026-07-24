/**
 * Add items to the current Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @param {Array<string|{key:string}>} [params.items]
 * @returns {*}
 */
export function context_add_items(params = {}) {
  const items = Array.isArray(params.items)
    ? params.items
    : []
  ;

  if (!items.length) return false;

  return this.add_items(items);
}
