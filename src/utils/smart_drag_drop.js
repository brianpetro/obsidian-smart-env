export const SMART_DRAG_DATA_TYPE = 'application/x-smart-env-drag+json';

const SMART_DRAG_SCHEMA = 'smart-env-drag';
const SMART_DRAG_VERSION = 1;

/**
 * Return whether a DataTransfer object contains the Smart MIME type.
 *
 * Presence is intentionally separate from payload validation so targets can
 * fail closed when Smart data is present but malformed or unsupported.
 *
 * @param {DataTransfer|object} data_transfer
 * @returns {boolean}
 */
export function has_smart_drag_data(data_transfer) {
  if (!data_transfer) return false;

  if (data_transfer.types != null) {
    try {
      return Array.from(data_transfer.types)
        .includes(SMART_DRAG_DATA_TYPE)
      ;
    } catch {
      return false;
    }
  }

  if (typeof data_transfer.getData !== 'function') return false;

  try {
    return Boolean(data_transfer.getData(SMART_DRAG_DATA_TYPE));
  } catch {
    return false;
  }
}

/**
 * Normalize one Smart item identity.
 *
 * @param {unknown} collection_key
 * @param {unknown} item_key
 * @returns {{collection_key:string,item_key:string}|null}
 */
function normalize_smart_drag_ref(collection_key, item_key) {
  if (typeof collection_key !== 'string' || !collection_key.trim()) return null;
  if (typeof item_key !== 'string' || !item_key.trim()) return null;

  return {
    collection_key,
    item_key,
  };
}

/**
 * Write Smart item identity to a DataTransfer object.
 *
 * @param {DataTransfer|object} data_transfer
 * @param {object|object[]} item_or_items
 * @returns {boolean}
 */
export function write_smart_drag_data(data_transfer, item_or_items) {
  if (typeof data_transfer?.setData !== 'function') return false;

  const raw_items = Array.isArray(item_or_items)
    ? item_or_items
    : [item_or_items]
  ;
  const items = raw_items
    .map((item) => {
      return normalize_smart_drag_ref(
        item?.collection_key,
        item?.item_key || item?.key,
      );
    })
    .filter(Boolean)
  ;
  if (!items.length) return false;

  const payload = {
    schema: SMART_DRAG_SCHEMA,
    version: SMART_DRAG_VERSION,
    items,
  };

  try {
    data_transfer.setData(
      SMART_DRAG_DATA_TYPE,
      JSON.stringify(payload),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and validate Smart item identity from a DataTransfer object.
 *
 * @param {DataTransfer|object} data_transfer
 * @returns {{schema:'smart-env-drag',version:1,items:Array<{collection_key:string,item_key:string}>}|null}
 */
export function read_smart_drag_data(data_transfer) {
  if (typeof data_transfer?.getData !== 'function') return null;

  let raw_payload = '';
  try {
    raw_payload = data_transfer.getData(SMART_DRAG_DATA_TYPE);
  } catch {
    return null;
  }
  if (!raw_payload) return null;

  let payload;
  try {
    payload = JSON.parse(raw_payload);
  } catch {
    return null;
  }

  if (payload?.schema !== SMART_DRAG_SCHEMA) return null;
  if (payload?.version !== SMART_DRAG_VERSION) return null;
  if (!Array.isArray(payload.items)) return null;

  const items = payload.items
    .map((item) => {
      return normalize_smart_drag_ref(
        item?.collection_key,
        item?.item_key,
      );
    })
    .filter(Boolean)
  ;
  if (!items.length) return null;

  return {
    schema: SMART_DRAG_SCHEMA,
    version: SMART_DRAG_VERSION,
    items,
  };
}
