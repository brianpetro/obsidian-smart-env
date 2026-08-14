import { SecretsAdapter } from './adapters/smart-secrets/_adapter.js';

/**
 * Stores sensitive values by exact credential ID.
 * Persistence is delegated to the configured platform adapter.
 */
export class SmartSecrets {
  constructor(env, opts = {}) {
    this.env = env;
    this.opts = opts;
  }

  static async create(env, opts = {}) {
    const smart_secrets = new this(env, opts);
    env.smart_secrets = smart_secrets;
    return smart_secrets;
  }

  get adapter() {
    if (!this._adapter) {
      const AdapterClass = this.opts.adapter || SecretsAdapter;
      this._adapter = new AdapterClass(this);
    }
    return this._adapter;
  }

  get_by_id(secret_id) {
    if (!secret_id) return null;
    return this.adapter.get_by_id(secret_id);
  }

  set_by_id(secret_id, value) {
    if (!secret_id) return false;
    return this.adapter.set_by_id(secret_id, value);
  }

  delete_by_id(secret_id) {
    if (!secret_id) return false;
    return this.adapter.delete_by_id(secret_id);
  }
}
