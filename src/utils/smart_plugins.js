import { requestUrl } from 'obsidian';

/**
 * If the user or test code sets window.SMART_SERVER_URL_OVERRIDE,
 * we use that as the base URL. Otherwise, default to production.
 * @returns {string}
 */
export function get_smart_server_url() {
  if (typeof window !== 'undefined' && window.SMART_SERVER_URL_OVERRIDE) {
    return window.SMART_SERVER_URL_OVERRIDE;
  }
  return 'https://connect.smartconnections.app';
}

/**
 * Writes {fileName, data} to vault's baseFolder. Creates subfolders as needed.
 * Applies accessed_at timestamp to file creation and modification times
 * @param {import('obsidian').DataAdapter} adapter
 * @param {string} baseFolder
 * @param {{fileName:string, data:Uint8Array, accessed_at:number}[]} files
 */
export async function write_files_with_adapter(adapter, baseFolder, files) {
  const hasWriteBinary = typeof adapter.writeBinary === 'function';
  if (!(await adapter.exists(baseFolder))) {
    await adapter.mkdir(baseFolder);
  }
  for (const { fileName, data, accessed_at } of files) {
    const fullPath = baseFolder + '/' + fileName;
    if (hasWriteBinary) {
      await adapter.writeBinary(fullPath, data, {ctime: accessed_at, mtime: accessed_at});
    } else {
      const base64 = btoa(String.fromCharCode(...data));
      await adapter.write(fullPath, base64, {ctime: accessed_at, mtime: accessed_at});
    }
  }
}

/**
 * Calls server /plugin_download to get an individual plugin file.
 *
 * @param {string} repo_name
 * @param {string} token
 * @param {object} [params]
 * @param {string} [params.file]
 * @param {string} [params.version]
 * @returns {Promise<any>}
 */
export async function fetch_plugin_file(repo_name, token, params = {}) {
  const file = String(params.file || '').trim();
  if (!file) {
    throw new Error('file required');
  }

  const body = {
    repo: repo_name,
    file,
  };
  const version = String(params.version || '').trim();
  if (version) {
    body.version = version;
  }

  const resp = await requestUrl({
    url: `${get_smart_server_url()}/plugin_download`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (resp.status !== 200) {
    throw new Error(`plugin_download error ${resp.status}: ${resp.text}`);
  }

  return resp;
}

/**
 * Read a response header value regardless of header container shape.
 *
 * @param {any} response
 * @param {string} header_name
 * @returns {string}
 */
export function get_response_header_value(response, header_name) {
  const normalized_header_name = String(header_name || '').trim().toLowerCase();
  if (!normalized_header_name) return '';

  const headers = response?.headers;
  if (!headers) return '';

  if (typeof headers.get === 'function') {
    return String(
      headers.get(header_name) ||
      headers.get(normalized_header_name) ||
      ''
    ).trim();
  }

  if (Array.isArray(headers)) {
    const match = headers.find(([key]) => {
      return String(key || '').trim().toLowerCase() === normalized_header_name;
    });
    return String(match?.[1] || '').trim();
  }

  if (typeof headers === 'object') {
    const key = Object.keys(headers).find((candidate_key) => {
      return String(candidate_key || '').trim().toLowerCase() === normalized_header_name;
    });
    return String((key && headers[key]) || '').trim();
  }

  return '';
}

/**
 * Persists the current enabled plugins to the configuration file.
 *
 * The configuration file is assumed to be "app.json" in the vault root. Its structure is:
 *
 * {
 *   "enabled_plugins": [ "plugin_id1", "plugin_id2", ... ]
 * }
 *
 * @param {object} app - The Obsidian app instance.
 * @param {string} plugin_id
 * @returns {Promise<void>}
 */
export async function enable_plugin(app, plugin_id) {
  await app.plugins.enablePlugin(plugin_id);
  app.plugins.enabledPlugins.add(plugin_id);
  app.plugins.requestSaveConfig();
  app.plugins.loadManifests();
}

/**
 * Compute the Smart Plugins OAuth storage prefix based on the vault name.
 *
 *   `${vault_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_smart_plugins_oauth_`
 *
 * @param {import('obsidian').App} app
 * @returns {string}
 */
export function get_oauth_storage_prefix(app) {
  const vault_name = app?.vault?.getName?.() || '';
  const safe = vault_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${safe}_smart_plugins_oauth_`;
}

export async function fetch_server_plugin_list(token) {
  const resp = await requestUrl({
    url: `${get_smart_server_url()}/plugin_list`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  if (resp.status !== 200) {
    throw new Error(`plugin_list error ${resp.status}: ${resp.text}`);
  }
  return resp.json;
}

/**
 * Fetch referral stats for the authenticated user.
 *
 * @param {object} params
 * @param {string} params.token
 * @returns {Promise<object>}
 */
export async function fetch_referral_stats(params = {}) {
  const token = String(params.token || '').trim();
  if (!token) return { ok: false, error: 'missing_token' };

  const resp = await requestUrl({
    url: `${get_smart_server_url()}/api/referrals/stats`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  });

  if (resp.status === 401) {
    return { ok: false, unauthorized: true };
  }
  if (resp.status !== 200) {
    throw new Error(`referrals stats error ${resp.status}: ${resp.text}`);
  }

  return resp.json;
}
