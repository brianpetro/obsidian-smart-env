/**
 * Normalize a context item path for remove-target comparisons.
 *
 * @param {string} path
 * @returns {string}
 */
export function normalize_remove_path(path = '') {
  return String(path || '').replace(/\/+$/g, '');
}

/**
 * Determine whether a context item key should be removed by a target path.
 *
 * A source target removes:
 * - the exact source key
 * - descendant folder paths
 * - block and line refs beneath the source
 *
 * @param {string} item_key
 * @param {string} target_path
 * @returns {boolean}
 */
export function item_matches_remove_path(item_key = '', target_path = '') {
  const normalized_item_key = normalize_remove_path(item_key);
  const normalized_target_path = normalize_remove_path(target_path);
  if (!normalized_item_key || !normalized_target_path) return false;
  return normalized_item_key === normalized_target_path
    || normalized_item_key.startsWith(normalized_target_path + '/')
    || normalized_item_key.startsWith(normalized_target_path + '#')
    || normalized_item_key.startsWith(normalized_target_path + '{')
  ;
}

/**
 * Normalize, dedupe, and compress remove targets.
 *
 * When a broader parent target is present, child targets are redundant and are
 * removed from the final list. This keeps batch remove behavior stable across
 * UI and CLI paths.
 *
 * @param {Array<string|{ path?: string, key?: string, folder?: boolean }>|string|{ path?: string, key?: string, folder?: boolean }} target_paths
 * @param {object} [params={}]
 * @param {boolean} [params.folder=false]
 * @returns {Array<{ path: string, norm_key: string, folder: boolean }>}
 */
export function normalize_remove_targets(target_paths = [], params = {}) {
  const items = Array.isArray(target_paths) ? target_paths : [target_paths];
  const targets = [];

  items.forEach((target) => {
    const path = typeof target === 'string'
      ? target
      : (target?.path || target?.key)
    ;
    const normalized_path = String(path || '').trim();
    if (!normalized_path) return;

    const next_target = {
      path: normalized_path,
      norm_key: normalize_remove_path(normalized_path),
      folder: target?.folder === true || params.folder === true,
    };

    for (const existing_target of targets) {
      if (item_matches_remove_path(next_target.norm_key, existing_target.norm_key)) return;
    }

    for (let i = targets.length - 1; i >= 0; i -= 1) {
      if (item_matches_remove_path(targets[i].norm_key, next_target.norm_key)) {
        targets.splice(i, 1);
      }
    }

    targets.push(next_target);
  });

  return targets;
}
