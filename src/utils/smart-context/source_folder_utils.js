/**
 * Normalize a folder path for prefix comparisons.
 *
 * @param {string} folder_path
 * @returns {string}
 */
export function normalize_folder_path(folder_path) {
  if (typeof folder_path !== 'string') return '';
  return folder_path.replace(/\/+$/g, '');
}

/**
 * Preserve the current modal input before drilling into a nested suggestion scope.
 *
 * @param {object} modal
 * @returns {void}
 */
export function reset_modal_input(modal) {
  if (!modal?.inputEl) return;
  modal.last_input_value = modal.inputEl.value;
  modal.inputEl.value = '';
}

/**
 * Resolve the source list for the current folder scope.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {string} [params.folder_path]
 * @returns {Array<{ key: string }>}
 */
export function get_sources_list(ctx, params = {}) {
  const folder_path = params?.folder_path || '';
  const normalized_folder_path = normalize_folder_path(folder_path);
  if(!normalized_folder_path) {
    return Object.values(ctx?.env?.smart_sources?.items || {});
  }
  const starts_with_folder_path = `${normalized_folder_path}/`;
  return ctx?.env?.smart_sources?.filter((item) => {
    if (item.key === normalized_folder_path) return true;
    return item.key.startsWith(starts_with_folder_path);
  });
}
