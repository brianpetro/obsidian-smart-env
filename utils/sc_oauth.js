/**
 * @file sc_oauth.js
 * @description Reusable OAuth logic for Smart Plugins in Obsidian.
 * We store tokens in localStorage under:
 *   - smart_plugins_oauth_token
 *   - smart_plugins_oauth_refresh
 *
 * Handles:
 *   1) Exchanging code for tokens
 *   2) Installing the legacy "smart-plugins" plugin from the server using
 *      the same file-based contract as the Plugin Store
 */

import { requestUrl } from 'obsidian';
import {
  enable_plugin,
  fetch_plugin_file,
  get_response_header_value,
  get_smart_server_url,
  write_files_with_adapter,
} from '../src/utils/smart_plugins.js';
export { get_smart_server_url, enable_plugin };

const CLIENT_ID = 'smart-plugins-op';
const CLIENT_SECRET = 'smart-plugins-op-secret';
const install_file_names = ['manifest.json', 'main.js', 'styles.css'];

export function get_local_storage_token(oauth_storage_prefix) {
  return {
    token: localStorage.getItem(oauth_storage_prefix + 'token') || '',
    refresh: localStorage.getItem(oauth_storage_prefix + 'refresh') || ''
  };
}

export function set_local_storage_token({ access_token, refresh_token }, oauth_storage_prefix) {
  localStorage.setItem(oauth_storage_prefix + 'token', access_token);
  if (refresh_token) {
    localStorage.setItem(oauth_storage_prefix + 'refresh', refresh_token);
  }
}

/**
 * Exchange code for tokens => store them.
 */
export async function exchange_code_for_tokens(code, plugin) {
  const oauth_storage_prefix = build_oauth_storage_prefix(plugin.app.vault.getName());
  const url = `${get_smart_server_url()}/auth/oauth_exchange2`;
  const resp = await requestUrl({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code
    })
  });
  if (resp.status !== 200) {
    throw new Error(`OAuth exchange error ${resp.status} ${resp.text}`);
  }
  const { access_token, refresh_token } = resp.json;
  if (!access_token) {
    throw new Error('No access_token in response');
  }
  set_local_storage_token({ access_token, refresh_token }, oauth_storage_prefix);
}

/**
 * Refresh tokens using refresh_token when available.
 */
export async function refresh_tokens_if_needed(plugin) {
  const oauth_storage_prefix = build_oauth_storage_prefix(plugin.app.vault.getName());
  const { refresh } = get_local_storage_token(oauth_storage_prefix);
  if (!refresh) return false;
  const url = `${get_smart_server_url()}/auth/oauth_exchange2`;
  const resp = await requestUrl({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refresh
    })
  });
  if (resp.status !== 200) {
    console.warn(`Refresh tokens error ${resp.status} ${resp.text}`);
    return false;
  }
  const { access_token, refresh_token } = resp.json;
  if (!access_token) return false;
  set_local_storage_token({ access_token, refresh_token }, oauth_storage_prefix);
  return true;
}

const OAUTH_SUFFIX = '_smart_plugins_oauth_';
/**
 * Build the Smart Plugins OAuth storage prefix for a given vault name.
 *
 * @param {string} vault_name
 * @returns {string}
 */
export function build_oauth_storage_prefix(vault_name) {
  const safe_name = String(vault_name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  return `${safe_name}${OAUTH_SUFFIX}`;
}

function normalize_positive_epoch_ms(value) {
  const numeric_value = Number(value);
  if (!Number.isFinite(numeric_value) || numeric_value <= 0) {
    return null;
  }
  return Math.round(numeric_value);
}

function get_plugin_file_text(response, file_name) {
  if (typeof response?.text === 'string' && response.text.length) {
    return response.text;
  }

  if (response?.arrayBuffer instanceof ArrayBuffer) {
    return new TextDecoder('utf-8').decode(response.arrayBuffer);
  }

  if (file_name === 'manifest.json' && response?.json) {
    return JSON.stringify(response.json, null, 2);
  }

  return '';
}

function build_plugin_file_record(file_name, response) {
  return {
    fileName: file_name,
    data: new TextEncoder().encode(get_plugin_file_text(response, file_name)),
    accessed_at: normalize_positive_epoch_ms(
      get_response_header_value(response, 'accessed_at')
    ) || Date.now(),
  };
}
