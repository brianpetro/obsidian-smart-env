/**
 * Routes sensitive settings fields (API keys) through Obsidian's OS-keychain-backed
 * `app.secretStorage` (available in Obsidian 1.11.4+) instead of persisting them in
 * plaintext inside the environment's `smart_env.json` on disk.
 *
 * When `secretStorage` is unavailable (older Obsidian), callers fall back to the
 * previous plaintext behavior so the plugin keeps working.
 */

const SECRET_ID_PREFIX = 'smart-env:';

/** Setting field names treated as secrets, at any depth of the settings object. */
const SECRET_FIELD_NAMES = ['api_key'];

export function is_secret_storage_available(app) {
  return !!app && 'secretStorage' in app && app.secretStorage != null;
}

function get_storage(app) {
  return is_secret_storage_available(app) ? app.secretStorage : null;
}

function secret_id(path) {
  return `${SECRET_ID_PREFIX}${path}`;
}

// `getSecret`/`setSecret` may be sync or async depending on the Obsidian build;
// awaiting a non-promise is a no-op, so this works for both.
async function read_secret(app, id) {
  const storage = get_storage(app);
  if (!storage) return null;
  const value = await storage.getSecret(id);
  return value && value.length > 0 ? value : null;
}

async function write_secret(app, id, value) {
  const storage = get_storage(app);
  if (!storage) return;
  await storage.setSecret(id, value == null ? '' : String(value));
}

function get_path(obj, path) {
  return path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

function set_path(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') return false;
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return true;
}

/** Paths of every secret-named field present in `obj` (regardless of value). */
function collect_secret_field_paths(obj, prefix = '', out = []) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (SECRET_FIELD_NAMES.includes(key)) {
      if (typeof value === 'string') out.push(path);
    } else if (value && typeof value === 'object') {
      collect_secret_field_paths(value, path, out);
    }
  }
  return out;
}

/**
 * Returns a JSON-safe copy of `settings` with every secret field blanked, after
 * persisting each non-empty secret value into `secretStorage`. Used before writing
 * settings to disk so the plaintext key never reaches `smart_env.json`.
 * Falls back to returning `settings` unchanged when `secretStorage` is unavailable.
 * @returns {Promise<Object>}
 */
export async function externalize_secrets(app, settings) {
  if (!is_secret_storage_available(app)) return settings;
  const clone = JSON.parse(JSON.stringify(settings));
  for (const path of collect_secret_field_paths(clone)) {
    const value = get_path(clone, path);
    if (typeof value === 'string' && value.length > 0) {
      await write_secret(app, secret_id(path), value);
    }
    set_path(clone, path, '');
  }
  return clone;
}

/**
 * Injects secret values from `secretStorage` back into `settings` in place, and
 * migrates any legacy plaintext secret still present on disk into `secretStorage`.
 * @returns {Promise<{ migrated: boolean }>} `migrated` is true when a plaintext
 *   secret was found on disk and moved into the keychain (caller should re-save).
 */
export async function internalize_secrets(app, settings) {
  if (!is_secret_storage_available(app)) return { migrated: false };
  let migrated = false;
  for (const path of collect_secret_field_paths(settings)) {
    const disk_value = get_path(settings, path);
    if (typeof disk_value === 'string' && disk_value.length > 0) {
      // Legacy plaintext key from before keychain storage: move it into the keychain.
      await write_secret(app, secret_id(path), disk_value);
      migrated = true;
    } else {
      const stored = await read_secret(app, secret_id(path));
      if (stored) set_path(settings, path, stored);
    }
  }
  return { migrated };
}
