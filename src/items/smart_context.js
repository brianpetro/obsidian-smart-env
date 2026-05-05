import { SmartContext as BaseClass } from 'smart-contexts/smart_context.js';

export class SmartContext extends BaseClass {
  get named_contexts () {
    return Object.entries(this.data?.context_items || {})
      .filter(([name, item_data]) => item_data?.named_context)
      .map(([name, item_data]) => this.env.smart_contexts.get_named_context(item_data?.key || name))
      .filter(Boolean)
    ;
  }
  /**
   * @param {string} target_path
   */
  remove_by_path(target_path, params = {}) {
    return this.remove_by_paths([
      {
        path: target_path,
        ...(params.folder ? { folder: true } : {}),
      },
    ], params);
  }

  /**
   * Remove multiple paths from context in one data pass.
   *
   * @param {Array<string|{ path:string, folder?:boolean }>} target_paths
   * @param {object} [params={}]
   * @param {boolean} [params.emit_updated=true]
   * @param {boolean} [params.queue_save=true]
   * @returns {string[]}
   */
  remove_by_paths(target_paths = [], params = {}) {
    const {
      emit_updated = true,
      queue_save = true,
    } = params;
    const targets = normalize_remove_targets(target_paths, params);
    if (!targets.length) return [];

    const context_items = this.data?.context_items || {};
    const remove_keys = [];

    Object.keys(context_items).forEach((key) => {
      const target = targets.find((target) => item_matches_remove_path(key, target.norm_key));
      if (!target) return;
      remove_keys.push(key);
    });

    remove_keys.forEach((key) => {
      delete context_items[key];
    });

    if (!remove_keys.length) return [];

    if (emit_updated) {
      this.emit_event('context:updated', {
        removed_key: targets[0].path,
        removed_keys: targets.map((target) => target.path),
        ...(targets.some((target) => target.folder) ? { folder: true } : {}),
      });
    }

    if (queue_save) this.queue_save();
    return remove_keys;
  }

  /**
   * add_item
   * this override adds implementation-specific (source/block pattern) logic to remove redundant block items when a parent source is added
   * @param {string|object} item
   */
  add_item(item, params = {}) {
    const {
      emit_updated = true,
    } = params;
    let key;
    if (typeof item === 'object') {
      key = item.key || item.path;
    } else {
      key = item;
    }
    const existing = this.data.context_items[key];
    const context_item = {
      d: 0,
      at: Date.now(),
      ...(existing || {}),
      ...(typeof item === 'object' ? item : {}),
    };
    if (!key) return console.error('SmartContext: add_item called with invalid item', item);
    const emit_payload = { add_item: key };
    const remove_sub_keys = Object.entries(this.data.context_items)
      .filter(([existing_key]) => existing_key !== key && existing_key.startsWith(key))
      .map(([existing_key]) => existing_key)
    ;
    if (remove_sub_keys.length) {
      this.remove_items(remove_sub_keys, { emit_updated: false });
      emit_payload.removed_keys = remove_sub_keys;
      emit_payload.message = 'Parent item added, removed redundant sub-items';
    }
    this.data.context_items[key] = context_item;
    this.queue_save();
    if (emit_updated) this.emit_event('context:updated', emit_payload);
  }
}

function normalize_remove_targets(target_paths = [], params = {}) {
  const items = Array.isArray(target_paths) ? target_paths : [target_paths];
  const targets = [];

  items.forEach((target) => {
    const path = typeof target === 'string'
      ? target
      : target?.path
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

function normalize_remove_path(path = '') {
  return String(path || '').replace(/\/+$/g, '');
}

function item_matches_remove_path(item_key = '', target_path = '') {
  const normalized_item_key = normalize_remove_path(item_key);
  const normalized_target_path = normalize_remove_path(target_path);
  if (!normalized_item_key || !normalized_target_path) return false;
  return normalized_item_key === normalized_target_path
    || normalized_item_key.startsWith(normalized_target_path + '/')
    || normalized_item_key.startsWith(normalized_target_path + '#')
    || normalized_item_key.startsWith(normalized_target_path + '{')
  ;
}
