/********************************************************************
 * utils.js
 * Shared logic extracted for use by main.js and settings_tab.js.
 * 
 * This file contains the "early known working logic" from settings_tab.js
 * plus the repeated functions from main.js, unified into a single module.
 ********************************************************************/

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
 * Attempt Node zlib in Obsidian desktop with window.require("zlib").
 * @returns {any|null}
 */
export function try_get_zlib() {
  if (typeof window?.require === 'function') {
    try {
      return window.require('zlib');
    } catch {}
  }
  return null;
}

/**
 * If compressionMethod=8, do deflate inflation with zlib.inflateRawSync.
 * @param {Uint8Array} compressed
 * @returns {Uint8Array}
 * @throws {Error} if zlib not available or inflation fails
 */
export function inflate_deflate_data(compressed) {
  const zlib = try_get_zlib();
  if (!zlib) {
    throw new Error('zlib not available (maybe Obsidian mobile?).');
  }
  const buf = Buffer.from(compressed);
  const out = zlib.inflateRawSync(buf);
  return new Uint8Array(out.buffer, out.byteOffset, out.length);
}

/**
 * Minimal ZIP parser that handles bit 3 data descriptor for local file headers.
 * Returns { files, pluginManifest } where:
 *  - files is an array of { fileName, data }
 *  - pluginManifest is parsed from top-level "manifest.json" if found
 *
 * @param {ArrayBuffer} zipBuffer
 * @returns {Promise<{ files: { fileName: string, data: Uint8Array }[], pluginManifest: any }>}
 */
export async function parse_zip_into_files(zipBuffer) {
  const dv = new DataView(zipBuffer);
  let offset = 0;
  const length = dv.byteLength;
  const files = [];
  let pluginManifest = null;

  while (offset + 4 <= length) {
    // local file header signature => 0x04034b50
    const localSig = dv.getUint32(offset, true);
    if (localSig === 0x02014b50 || localSig === 0x08074b50) {
      break;
    }
    if (localSig !== 0x04034b50) {
      break;
    }
    offset += 4;

    // [2] versionNeeded, [2] generalPurposeBitFlag, [2] compressionMethod
    const versionNeeded = dv.getUint16(offset, true);
    const generalPurposeBitFlag = dv.getUint16(offset + 2, true);
    const compressionMethod = dv.getUint16(offset + 4, true);
    offset += 6;

    // [4] lastModTimeDate
    const lastModTimeDate = dv.getUint32(offset, true);
    offset += 4;

    // [4] CRC, [4] compressedSize, [4] uncompressedSize => 12 bytes
    let crc32 = dv.getUint32(offset, true);
    let compressedSize = dv.getUint32(offset + 4, true);
    let uncompressedSize = dv.getUint32(offset + 8, true);
    offset += 12;

    // [2] fileNameLen, [2] extraLen => 4 bytes
    const fileNameLen = dv.getUint16(offset, true);
    const extraLen = dv.getUint16(offset + 2, true);
    offset += 4;

    const fileNameBytes = new Uint8Array(zipBuffer.slice(offset, offset + fileNameLen));
    const fileName = new TextDecoder('utf-8').decode(fileNameBytes);
    offset += fileNameLen;
    offset += extraLen;

    const hasDataDescriptor = (generalPurposeBitFlag & 0x0008) !== 0;

    let compDataStart = offset;
    let compDataEnd;
    if (!hasDataDescriptor) {
      compDataEnd = compDataStart + compressedSize;
    } else {
      // bit 3 => must search for next signature
      let scanPos = compDataStart;
      let foundSig = false;
      while (scanPos + 4 <= length) {
        const sig = dv.getUint32(scanPos, true);
        if (
          sig === 0x08074b50 ||
          sig === 0x04034b50 ||
          sig === 0x02014b50
        ) {
          foundSig = true;
          break;
        }
        scanPos++;
      }
      compDataEnd = foundSig ? scanPos : length;
    }
    if (compDataEnd > length) {
      break;
    }

    const fileDataCompressed = new Uint8Array(zipBuffer.slice(compDataStart, compDataEnd));
    offset = compDataEnd;

    // optional data descriptor
    if (hasDataDescriptor) {
      if (offset + 4 <= length) {
        const ddSig = dv.getUint32(offset, true);
        if (ddSig === 0x08074b50) {
          offset += 4;
        }
        if (offset + 12 <= length) {
          crc32 = dv.getUint32(offset, true);
          compressedSize = dv.getUint32(offset + 4, true);
          uncompressedSize = dv.getUint32(offset + 8, true);
          offset += 12;
        } else {
          break;
        }
      }
    }

    // decompress if needed
    let rawData;
    if (compressionMethod === 0) {
      rawData = fileDataCompressed;
    } else if (compressionMethod === 8) {
      rawData = inflate_deflate_data(fileDataCompressed);
    } else {
      // unsupported compression => skip
      continue;
    }

    files.push({ fileName, data: rawData });

    // check if it's top-level manifest.json
    if (fileName.toLowerCase().endsWith('manifest.json') && !fileName.includes('/')) {
      try {
        pluginManifest = JSON.parse(new TextDecoder('utf-8').decode(rawData));
      } catch {}
    }
  }

  return { files, pluginManifest };
}

/**
 * Writes {fileName, data} to vault's baseFolder. Creates subfolders as needed.
 * @param {import('obsidian').DataAdapter} adapter
 * @param {string} baseFolder
 * @param {{fileName:string, data:Uint8Array}[]} files
 */
export async function write_files_with_adapter(adapter, baseFolder, files) {
  const hasWriteBinary = typeof adapter.writeBinary === 'function';
  if (!(await adapter.exists(baseFolder))) {
    await adapter.mkdir(baseFolder);
  }
  for (const { fileName, data } of files) {
    const fullPath = baseFolder + '/' + fileName;
    if (hasWriteBinary) {
      await adapter.writeBinary(fullPath, data);
    } else {
      const base64 = btoa(String.fromCharCode(...data));
      await adapter.write(fullPath, base64);
    }
  }
}

/**
 * Naive semver comparison: returns true if serverVer > localVer.
 * @param {string} localVer
 * @param {string} serverVer
 * @returns {boolean}
 */
export function is_server_version_newer(localVer, serverVer) {
  if (!serverVer || serverVer === 'unknown') return false;
  const lv = localVer.replace(/[^\d.]/g, '');
  const sv = serverVer.replace(/[^\d.]/g, '');

  const la = lv.split('.').map(Number);
  const sa = sv.split('.').map(Number);
  for (let i = 0; i < Math.max(la.length, sa.length); i++) {
    const l = la[i] || 0;
    const s = sa[i] || 0;
    if (s > l) return true;
    if (s < l) return false;
  }
  return false;
}

/**
 * Calls server /plugin_download to get the zip ArrayBuffer.
 * Used by main.js or any consumer that needs the plugin .zip.
 * 
 * @param {string} repoName
 * @param {string} token
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetch_plugin_zip(repoName, token) {
  const resp = await requestUrl({
    url: `${get_smart_server_url()}/plugin_download`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ repo: repoName })
  });
  if (resp.status !== 200) {
    throw new Error(`plugin_download error ${resp.status}: ${resp.text}`);
  }

  const ab = resp.arrayBuffer;
  if (ab.byteLength < 4) {
    throw new Error('Server returned too few bytes, not a valid ZIP.');
  }
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== 0x04034b50) {
    const txt = new TextDecoder().decode(new Uint8Array(ab));
    throw new Error(`Server did not return a valid ZIP. Text:\n${txt}`);
  }
  return ab;
}

/**
 * Fetch README markdown from Smart Server.
 *
 * @param {string} repo
 * @param {string} token
 * @param {Function} request_fn
 * @returns {Promise<string>}
 */
export async function fetch_plugin_readme(repo, token, request_fn = requestUrl) {
  const resp = await request_fn({
    url: `${get_smart_server_url()}/plugin_readme`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ repo })
  });
  if (resp.status !== 200) {
    throw new Error(`plugin_readme error ${resp.status}: ${resp.text}`);
  }
  return resp.json.readme;
}

/**
 * Converts unauthorized plugin list into display-friendly objects.
 *
 * @param {Array<{repo: string, link: string}>} unauthorized
 * @returns {Array<{name: string, link: string}>}
 */
export function derive_unauthorized_display(unauthorized = []) {
  return unauthorized.map(({ repo, link }) => ({
    name: repo.split('/').pop(),
    link
  }));
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
 * @returns {Promise<void>}
 */
export async function enable_plugin(app, plugin_id) {
  await app.plugins.enablePlugin(plugin_id);
  app.plugins.enabledPlugins.add(plugin_id);
  app.plugins.requestSaveConfig();
  app.plugins.loadManifests();
}