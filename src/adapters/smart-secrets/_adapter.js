export class SecretsAdapter {
  constructor(smart_secrets) {
    this.smart_secrets = smart_secrets;
    this.data = {};
  }

  get is_persistent() {
    return false;
  }

  get(path) {
    const value = get_by_path(this.data, this.normalize_path(path));
    return typeof value === 'undefined' ? null : value;
  }

  set(path, value) {
    set_by_path(this.data, this.normalize_path(path), String(value || ''));
  }

  delete(path) {
    delete_by_path(this.data, this.normalize_path(path));
  }

  normalize_path(path) {
    if (Array.isArray(path)) return path.map(part => String(part)).filter(Boolean);
    return String(path || '').split('.').filter(Boolean);
  }
}

function get_by_path(obj, path = []) {
  return path.reduce((acc, part) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return acc[part];
  }, obj);
}

function set_by_path(obj, path = [], value = '') {
  if (!path.length) return;
  const leaf_key = path[path.length - 1];
  const parent = path.slice(0, -1).reduce((acc, part) => {
    if (!acc[part] || typeof acc[part] !== 'object') acc[part] = {};
    return acc[part];
  }, obj);
  parent[leaf_key] = value;
}

function delete_by_path(obj, path = []) {
  if (!path.length) return;
  const leaf_key = path[path.length - 1];
  const parent = get_by_path(obj, path.slice(0, -1));
  if (parent && typeof parent === 'object') delete parent[leaf_key];
}
