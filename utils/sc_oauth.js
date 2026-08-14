/**
 * @file sc_oauth.js
 * @description Reusable OAuth logic for Smart Plugins in Obsidian.
 * Tokens are stored in Obsidian SecretStorage under fixed, readable IDs.
 *
 * Handles:
 *   1) Exchanging code for tokens
 *   2) Refreshing an existing OAuth session
 *   3) Migrating legacy OAuth tokens
 */

import { requestUrl } from 'obsidian';
import {
  enable_plugin,
  get_smart_server_url,
} from '../src/utils/smart_plugins.js';
export { get_smart_server_url, enable_plugin };

const CLIENT_ID = 'smart-plugins-op';
const CLIENT_SECRET = 'smart-plugins-op-secret';
const ACCESS_TOKEN_SECRET_ID = 'smart-plugins-oauth-access';
const REFRESH_TOKEN_SECRET_ID = 'smart-plugins-oauth-refresh';
const LEGACY_OAUTH_SUFFIX = '_smart_plugins_oauth_';

/**
 * Return the temporary vault-derived SecretStorage IDs used by an earlier
 * development build.
 *
 * LEGACY: remove after every supported build has migrated these IDs.
 *
 * @param {import('smart-types').SmartEnv} env
 * @returns {{access_token: string, refresh_token: string}}
 */
function get_temporary_oauth_token_ids(env) {
  const vault_name = env.obsidian_app.vault.getName().toLowerCase();
  const vault_slug = vault_name
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    || 'vault'
  ;
  let vault_hash = 2166136261;

  for (let i = 0; i < vault_name.length; i++) {
    vault_hash ^= vault_name.charCodeAt(i);
    vault_hash = Math.imul(vault_hash, 16777619);
  }

  const hash = (vault_hash >>> 0).toString(36).padStart(7, '0');
  const prefix = `smart-plugins-oauth-${vault_slug}-${hash}`;

  return {
    access_token: `${prefix}-access`,
    refresh_token: `${prefix}-refresh`,
  };
}

/**
 * Return the historical localStorage IDs.
 *
 * LEGACY: remove after every supported build has migrated localStorage OAuth
 * tokens into SecretStorage.
 *
 * @param {import('smart-types').SmartEnv} env
 * @returns {{access_token: string, refresh_token: string}}
 */
function get_legacy_oauth_token_ids(env) {
  const vault_name = env.obsidian_app.vault.getName();
  const safe_name = vault_name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
  ;
  const prefix = `${safe_name}${LEGACY_OAUTH_SUFFIX}`;

  return {
    access_token: `${prefix}token`,
    refresh_token: `${prefix}refresh`,
  };
}

/**
 * Read the current Smart Plugins access token.
 *
 * @param {import('smart-types').SmartEnv} env
 * @returns {string}
 */
export function get_smart_plugins_token(env) {
  return env.smart_secrets?.get_by_id(ACCESS_TOKEN_SECRET_ID) || '';
}

function get_refresh_token(env) {
  return env.smart_secrets?.get_by_id(REFRESH_TOKEN_SECRET_ID) || '';
}

function set_token(env, secret_id, value) {
  const token = String(value || '');

  if (
    !token
    || !env.smart_secrets.set_by_id(secret_id, token)
    || env.smart_secrets.get_by_id(secret_id) !== token
  ) {
    throw new Error(
      'Unable to store Smart Plugins OAuth credentials securely.'
    );
  }
}

function set_oauth_tokens(env, tokens) {
  set_token(env, ACCESS_TOKEN_SECRET_ID, tokens.access_token);

  if (tokens.refresh_token) {
    set_token(env, REFRESH_TOKEN_SECRET_ID, tokens.refresh_token);
  }
}

/**
 * Move one OAuth token to its fixed SecretStorage ID.
 *
 * Migration precedence is:
 *   1) fixed SecretStorage ID
 *   2) temporary vault-derived SecretStorage ID
 *   3) historical localStorage ID
 *
 * @param {import('smart-types').SmartEnv} env
 * @param {string} secret_id
 * @param {string} temporary_id
 * @param {string} legacy_id
 * @returns {void}
 */
function migrate_token(env, secret_id, temporary_id, legacy_id) {
  let secure_value = env.smart_secrets.get_by_id(secret_id);
  const temporary_value = env.smart_secrets.get_by_id(temporary_id);

  if (temporary_value) {
    if (secure_value && secure_value !== temporary_value) {
      console.warn(
        'Smart Plugins OAuth migration found conflicting secure credentials.'
      );
    } else {
      if (!secure_value) {
        try {
          set_token(env, secret_id, temporary_value);
          secure_value = temporary_value;
        } catch (_error) {
          console.warn(
            'Smart Plugins OAuth migration could not move temporary credentials securely.'
          );
          return;
        }
      }

      env.smart_secrets.delete_by_id(temporary_id);
    }
  }

  const legacy_value = localStorage.getItem(legacy_id);
  if (!legacy_value) return;

  if (secure_value && secure_value !== legacy_value) {
    console.warn(
      'Smart Plugins OAuth migration found conflicting legacy credentials.'
    );
    return;
  }

  if (!secure_value) {
    try {
      set_token(env, secret_id, legacy_value);
    } catch (_error) {
      console.warn(
        'Smart Plugins OAuth migration could not store legacy credentials securely.'
      );
      return;
    }
  }

  localStorage.removeItem(legacy_id);
}

/**
 * Remove the current Smart Plugins OAuth session.
 *
 * @param {import('smart-types').SmartEnv} env
 * @returns {void}
 */
export function clear_smart_plugins_tokens(env) {
  const temporary_ids = get_temporary_oauth_token_ids(env);
  const legacy_ids = get_legacy_oauth_token_ids(env);

  env.smart_secrets?.delete_by_id(ACCESS_TOKEN_SECRET_ID);
  env.smart_secrets?.delete_by_id(REFRESH_TOKEN_SECRET_ID);

  // LEGACY: remove these deletions after every supported build has migrated
  // the temporary SecretStorage IDs.
  env.smart_secrets?.delete_by_id(temporary_ids.access_token);
  env.smart_secrets?.delete_by_id(temporary_ids.refresh_token);

  // LEGACY: remove these localStorage deletions after every supported build
  // has migrated to SmartSecrets.
  localStorage.removeItem(legacy_ids.access_token);
  localStorage.removeItem(legacy_ids.refresh_token);
}

/**
 * Move temporary and legacy OAuth tokens into their fixed SecretStorage IDs.
 *
 * LEGACY: remove this migration after every supported build uses the fixed
 * SecretStorage IDs and no longer stores OAuth tokens in localStorage.
 *
 * @param {import('smart-types').SmartEnv} env
 * @returns {void}
 */
export function migrate_legacy_oauth_tokens(env) {
  const temporary_ids = get_temporary_oauth_token_ids(env);
  const legacy_ids = get_legacy_oauth_token_ids(env);

  migrate_token(
    env,
    ACCESS_TOKEN_SECRET_ID,
    temporary_ids.access_token,
    legacy_ids.access_token,
  );
  migrate_token(
    env,
    REFRESH_TOKEN_SECRET_ID,
    temporary_ids.refresh_token,
    legacy_ids.refresh_token,
  );
}

/**
 * Exchange an OAuth code for tokens and store them securely.
 *
 * @param {string} code
 * @param {import('smart-types').SmartEnv} env
 * @returns {Promise<void>}
 */
export async function exchange_code_for_tokens(code, env) {
  const url = `${get_smart_server_url()}/auth/oauth_exchange2`;
  const resp = await requestUrl({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    }),
  });
  if (resp.status !== 200) {
    throw new Error(`OAuth exchange error ${resp.status} ${resp.text}`);
  }
  const { access_token, refresh_token } = resp.json;
  if (!access_token) {
    throw new Error('No access_token in response');
  }
  set_oauth_tokens(env, { access_token, refresh_token });
}

/**
 * Refresh tokens using the current refresh token when available.
 *
 * @param {import('smart-types').SmartEnv} env
 * @returns {Promise<boolean>}
 */
export async function refresh_tokens_if_needed(env) {
  const refresh_token = get_refresh_token(env);
  if (!refresh_token) return false;

  const url = `${get_smart_server_url()}/auth/oauth_exchange2`;
  const resp = await requestUrl({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token,
    }),
  });
  if (resp.status !== 200) {
    console.warn(`Refresh tokens error ${resp.status} ${resp.text}`);
    return false;
  }
  const { access_token, refresh_token: next_refresh_token } = resp.json;
  if (!access_token) return false;

  set_oauth_tokens(env, {
    access_token,
    refresh_token: next_refresh_token,
  });
  return true;
}
