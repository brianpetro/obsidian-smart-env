import { SecretsAdapter } from './_adapter.js';

/**
 * Implements Obsidian-specific secure storage for sensitive information.
 * https://docs.obsidian.md/plugins/guides/secret-storage
 * https://docs.obsidian.md/Reference/TypeScript+API/SecretStorage
 * https://docs.obsidian.md/Reference/TypeScript+API/SecretStorage/getSecret
 * https://docs.obsidian.md/Reference/TypeScript+API/SecretStorage/setSecret
 */
export class ObsidianSecretsAdapter extends SecretsAdapter {
  get secret_storage() {
    return this.smart_secrets.env?.obsidian_app?.secretStorage
      || this.smart_secrets.env?.plugin?.app?.secretStorage
      || globalThis.app?.secretStorage
    ;
  }

  get is_persistent() {
    return Boolean(this.secret_storage);
  }

  get(_path) {
    const storage = this.secret_storage;
    if (!storage) return super.get(_path);
    const secret_id = this.get_secret_id(_path);
    return storage.getSecret(secret_id);
  }

  set(_path, value) {
    const storage = this.secret_storage;
    if (!storage) return super.set(_path, value);
    const secret_id = this.get_secret_id(_path);
    storage.setSecret(secret_id, String(value || ''));
  }

  delete(_path) {
    const storage = this.secret_storage;
    if (!storage) return super.delete(_path);
    const secret_id = this.get_secret_id(_path);
    if (typeof storage.deleteSecret === 'function') {
      storage.deleteSecret(secret_id);
      return;
    }
    storage.setSecret(secret_id, '');
  }

  get_secret_id(_path) {
    if (typeof _path !== 'string' && !Array.isArray(_path)) {
      throw new Error('Invalid path for secret storage: ' + JSON.stringify(_path));
    }
    const path = this.normalize_path(_path);
    if (!path.length) {
      throw new Error('Invalid path for secret storage: ' + JSON.stringify(_path));
    }

    let secret_id = path.join('-');
    const [provider_id, created_at] = (path[1] || '').split('#');
    const is_model_api_key = path.length > 2 && path[path.length - 1] === 'api_key';
    if (is_model_api_key && provider_id && /^\d+$/.test(created_at)) {
      const timestamp = new Date(Number(created_at))
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, '-')
      ;
      secret_id = `${provider_id}-${timestamp}`;
    }

    return secret_id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    ;
  }
}
