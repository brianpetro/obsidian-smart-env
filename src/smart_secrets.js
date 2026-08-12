import { SecretsAdapter } from './adapters/smart-secrets/_adapter.js';

/**
 * Stores sensitive values behind a Smart Environment `secrets` getter.
 * Persistence is delegated to the configured adapter so each platform can use
 * its native secure storage where available.
 */
export class SmartSecrets {
  constructor(env, opts = {}) {
    this.env = env;
    this.opts = opts;
    this._secrets = {};
    this._proxy_cache = new WeakMap();
  }

  static async create(env, opts = {}) {
    const smart_secrets = new this(env, opts);
    await smart_secrets.load();
    env.smart_secrets = smart_secrets;
    Object.defineProperty(env, 'secrets', {
      configurable: true,
      get() { return smart_secrets.secrets; },
      set(secrets) { smart_secrets.secrets = secrets; },
    });
    return smart_secrets;
  }

  async load() {
    this._secrets = {};
  }

  get adapter() {
    if (!this._adapter) {
      const AdapterClass = this.opts.adapter || SecretsAdapter;
      this._adapter = new AdapterClass(this);
    }
    return this._adapter;
  }

  get secrets() {
    if (!this._secrets_proxy) {
      this._secrets_proxy = this.create_secret_proxy(this._secrets, []);
    }
    return this._secrets_proxy;
  }

  set secrets(secrets) {
    this._secrets = secrets || {};
    this._secrets_proxy = null;
    this._proxy_cache = new WeakMap();
  }

  get(path) {
    return this.adapter.get(this.normalize_path(path));
  }

  set(path, value) {
    const normalized_path = this.normalize_path(path);
    if (!String(value || '').length) {
      this.delete(normalized_path);
      return;
    }
    this.adapter.set(normalized_path, String(value));
    this.emit_changed(normalized_path, 'set');
  }

  delete(path) {
    const normalized_path = this.normalize_path(path);
    this.adapter.delete(normalized_path);
    this.emit_changed(normalized_path, 'delete');
  }

  create_secret_proxy(target, path) {
    if (!target || typeof target !== 'object') target = {};
    const cached_proxy = this._proxy_cache.get(target);
    if (cached_proxy) return cached_proxy;

    const proxy = new Proxy(target, {
      get: (target_obj, prop) => {
        if (prop === '$path') return path;
        if (prop === '$get') return (sub_path = []) => this.get([...path, ...this.normalize_path(sub_path)]);
        if (prop === '$set') return (sub_path = [], value = '') => this.set([...path, ...this.normalize_path(sub_path)], value);
        if (prop === '$delete') return (sub_path = []) => this.delete([...path, ...this.normalize_path(sub_path)]);
        if (prop === 'toJSON') return () => ({});
        if (prop === Symbol.toPrimitive) return () => '';
        if (typeof prop === 'symbol') return Reflect.get(target_obj, prop);

        if (Object.prototype.hasOwnProperty.call(target_obj, prop)) {
          const value = target_obj[prop];
          return value && typeof value === 'object'
            ? this.create_secret_proxy(value, [...path, prop])
            : value
          ;
        }

        const value = this.get([...path, prop]);
        if (value !== null && typeof value !== 'undefined') {
          target_obj[prop] = value;
          return value;
        }

        return undefined;
      },

      set: (target_obj, prop, value) => {
        if (typeof prop === 'symbol') {
          target_obj[prop] = value;
          return true;
        }

        if (value && typeof value === 'object') {
          target_obj[prop] = value;
          return true;
        }

        const next_path = [...path, prop];
        const next_value = String(value || '');
        target_obj[prop] = next_value;

        if (next_value.length) this.set(next_path, next_value);
        else this.delete(next_path);
        return true;
      },

      deleteProperty: (target_obj, prop) => {
        if (typeof prop === 'symbol') return true;
        if (Object.prototype.hasOwnProperty.call(target_obj, prop)) {
          delete target_obj[prop];
        }
        this.delete([...path, prop]);
        return true;
      },
    });

    this._proxy_cache.set(target, proxy);
    return proxy;
  }

  normalize_path(path) {
    if (Array.isArray(path)) return path.map(part => String(part)).filter(Boolean);
    return String(path || '').split('.').filter(Boolean);
  }

  emit_changed(path, type = 'set') {
    this.env?.events?.emit?.('secrets:changed', {
      type,
      path,
      path_string: path.join('.'),
    });
  }
}
