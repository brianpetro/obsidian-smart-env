import { SecretsAdapter } from './_adapter.js';

/**
 * Implements Obsidian-specific secure storage for exact credential IDs.
 * https://docs.obsidian.md/plugins/guides/secret-storage
 * https://docs.obsidian.md/Reference/TypeScript+API/SecretStorage
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

  get_by_id(secret_id) {
    const storage = this.secret_storage;
    if (!storage) return null;
    return storage.getSecret(secret_id) ?? null;
  }

  set_by_id(secret_id, value) {
    const storage = this.secret_storage;
    if (!storage) return false;
    storage.setSecret(secret_id, String(value ?? ''));
    return true;
  }

  delete_by_id(secret_id) {
    const storage = this.secret_storage;
    if (!storage) return false;
    if (typeof storage.deleteSecret === 'function') {
      storage.deleteSecret(secret_id);
    } else {
      storage.setSecret(secret_id, '');
    }
    return true;
  }
}
