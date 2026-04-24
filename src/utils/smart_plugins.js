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

export const install_file_names = ['manifest.json', 'main.js', 'styles.css'];

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
      await adapter.writeBinary(fullPath, data, { ctime: accessed_at, mtime: accessed_at });
    } else {
      const text = new TextDecoder('utf-8').decode(data);
      await adapter.write(fullPath, text, { ctime: accessed_at, mtime: accessed_at });
    }
  }
}

/**
 * Perform a Smart Plugins server request with optional Bearer auth.
 *
 * Uses `throw: false` so callers can preserve server messages on 401/403/500
 * instead of receiving opaque requestUrl exceptions.
 *
 * @param {object} [params={}]
 * @param {string} params.path
 * @param {string} [params.token]
 * @param {string} [params.method='POST']
 * @param {Record<string, string>} [params.headers]
 * @param {string} [params.body]
 * @param {string} [params.contentType]
 * @returns {Promise<any>}
 */
export async function authenticated_smart_plugins_request(params = {}) {
  const request_path = String(params.path || '').trim();
  if (!request_path) {
    throw new Error('path required');
  }

  const token = String(params.token || '').trim();
  const headers = {
    ...(params.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = request_path.startsWith('http')
    ? request_path
    : `${get_smart_server_url()}${request_path}`
  ;

  return await requestUrl({
    url,
    method: params.method || 'POST',
    headers,
    body: params.body,
    contentType: params.contentType,
    throw: false,
  });
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

  const resp = await authenticated_smart_plugins_request({
    token,
    path: '/plugin_download',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (resp.status !== 200) {
    throw new Error(
      get_response_message(resp) ||
      `plugin_download error ${resp.status}`
    );
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
 * Normalize an epoch-ms-like value.
 *
 * @param {any} value
 * @returns {number|null}
 */
export function normalize_positive_epoch_ms(value) {
  const numeric_value = Number(value);
  if (!Number.isFinite(numeric_value) || numeric_value <= 0) {
    return null;
  }
  return Math.round(numeric_value);
}

/**
 * Convert a plugin file response into text.
 *
 * @param {any} response
 * @param {string} file_name
 * @returns {string}
 */
export function get_plugin_file_text(response, file_name) {
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

/**
 * Build a plugin file write record from a server response.
 *
 * @param {string} file_name
 * @param {any} response
 * @returns {{fileName: string, data: Uint8Array, accessed_at: number}}
 */
export function build_plugin_file_record(file_name, response) {
  return {
    fileName: file_name,
    data: new TextEncoder().encode(get_plugin_file_text(response, file_name)),
    accessed_at: normalize_positive_epoch_ms(
      get_response_header_value(response, 'accessed_at')
    ) || Date.now(),
  };
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

/**
 * Safely read a JSON response body.
 *
 * @param {any} response
 * @returns {Record<string, any>}
 */
function get_response_json(response) {
  return response?.json && typeof response.json === 'object'
    ? response.json
    : {}
  ;
}

/**
 * Safely resolve a short response message.
 *
 * @param {any} response
 * @returns {string}
 */
function get_response_message(response) {
  return String(
    get_response_json(response)?.message ||
    get_response_json(response)?.error ||
    response?.text ||
    ''
  ).trim();
}

export async function fetch_server_plugin_list(token) {
  const resp = await authenticated_smart_plugins_request({
    token,
    path: '/plugin_list',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (resp.status !== 200) {
    return {
      list: [],
      sub_exp: null,
      status: resp.status,
      message: get_response_message(resp),
    };
  }

  const response_json = get_response_json(resp);
  return {
    ...response_json,
    status: resp.status,
    message: String(response_json?.message || '').trim(),
  };
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

  const resp = await authenticated_smart_plugins_request({
    token,
    path: '/api/referrals/stats',
    method: 'GET',
  });

  if (resp.status === 401) {
    return {
      ok: false,
      message: get_response_message(resp) || 'Invalid or expired token. Please log in again.',
    };
  }
  if (resp.status !== 200) {
    throw new Error(
      get_response_message(resp) ||
      `referrals stats error ${resp.status}`
    );
  }

  return get_response_json(resp);
}
