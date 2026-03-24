/**
 * Emit a clipboard lifecycle event when an environment is available.
 *
 * @param {any} env
 * @param {string} event_key
 * @param {object} payload
 * @returns {void}
 */
function emit_clipboard_event(env, event_key, payload = {}) {
  if (!event_key) return;
  env?.events?.emit?.(event_key, payload);
}

/**
 * Try the Async Clipboard API.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function write_with_navigator_clipboard(text) {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    return false;
  }
  await navigator.clipboard.writeText(text);
  return true;
}

/**
 * Try Electron's clipboard module.
 *
 * @param {string} text
 * @returns {boolean}
 */
function write_with_electron_clipboard(text) {
  if (typeof window === 'undefined' || typeof window.require !== 'function') {
    return false;
  }

  const electron = window.require('electron');
  if (!electron?.clipboard || typeof electron.clipboard.writeText !== 'function') {
    return false;
  }

  electron.clipboard.writeText(text);
  return true;
}

/**
 * Try a DOM `execCommand('copy')` fallback.
 *
 * @param {string} text
 * @returns {boolean}
 */
function write_with_exec_command(text) {
  if (typeof document === 'undefined') return false;
  if (typeof document.execCommand !== 'function') return false;
  if (!document.body?.appendChild) return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = Boolean(document.execCommand('copy'));
  } finally {
    textarea.remove();
  }

  return copied;
}

/**
 * Copy plain text to the system clipboard.
 *
 * @param {string} text
 * @param {object} [params={}]
 * @param {any} [params.env]
 * @param {string} [params.event_source='copy_to_clipboard']
 * @param {string} [params.success_event_key='clipboard:copied']
 * @param {string} [params.error_event_key='clipboard:copy_failed']
 * @param {string} [params.unavailable_event_key='clipboard:copy_unavailable']
 * @returns {Promise<boolean>}
 */
export async function copy_to_clipboard(text = '', params = {}) {
  const value = typeof text === 'string' ? text : String(text ?? '');
  const env = params.env || null;
  const event_source = params.event_source || 'copy_to_clipboard';
  const success_event_key = params.success_event_key || 'clipboard:copied';
  const error_event_key = params.error_event_key || 'clipboard:copy_failed';
  const unavailable_event_key = params.unavailable_event_key || 'clipboard:copy_unavailable';

  let last_error = null;

  try {
    if (await write_with_navigator_clipboard(value)) {
      emit_clipboard_event(env, success_event_key, {
        level: 'info',
        message: 'Text copied to clipboard.',
        event_source,
      });
      return true;
    }
  } catch (error) {
    last_error = error;
  }

  try {
    if (write_with_electron_clipboard(value)) {
      emit_clipboard_event(env, success_event_key, {
        level: 'info',
        message: 'Text copied to clipboard.',
        event_source,
      });
      return true;
    }
  } catch (error) {
    last_error = error;
  }

  try {
    if (write_with_exec_command(value)) {
      emit_clipboard_event(env, success_event_key, {
        level: 'info',
        message: 'Text copied to clipboard.',
        event_source,
      });
      return true;
    }
  } catch (error) {
    last_error = error;
  }

  if (last_error) {
    emit_clipboard_event(env, error_event_key, {
      level: 'error',
      message: 'Failed to copy text to clipboard.',
      details: last_error?.message || '',
      event_source,
    });
    return false;
  }

  emit_clipboard_event(env, unavailable_event_key, {
    level: 'warning',
    message: 'Clipboard copy is unavailable in this environment.',
    event_source,
  });
  return false;
}

export default copy_to_clipboard;


/**
 * Compared the above to below:
 */
// import { Platform } from 'obsidian';
// /**
//  * Copy text to clipboard in a cross-platform manner.
//  * On mobile, Node/Electron APIs are unavailable.
//  */
// export async function copy_to_clipboard(text, params = {}) {
//   const {
//     env = null,
//     event_source = 'copy_to_clipboard',
//     success_event_key = 'clipboard:copied',
//     error_event_key = 'clipboard:copy_failed',
//     unavailable_event_key = 'clipboard:copy_unavailable',
//   } = params;

//   try {
//     // First try standard browser clipboard API
//     if (navigator?.clipboard?.writeText) {
//       await navigator.clipboard.writeText(text);
//     }

//     // If not on mobile, attempt Electron's clipboard
//     else if (!Platform.isMobile) {
//       const { clipboard } = require('electron');
//       clipboard.writeText(text);
//     }

//     // Otherwise, no known method for copying
//     else {
//       env?.events?.emit?.(unavailable_event_key, {
//         level: 'warning',
//         message: 'Unable to copy text: no valid method found.',
//         event_source,
//       });
//       return false;
//     }
//     env?.events?.emit?.(success_event_key, {
//       level: 'info',
//       message: `Copied ${text.length} characters to clipboard`,
//       event_source,
//     });
//     return true;
//   } catch (err) {
//     console.error('Failed to copy text:', err);
//     env?.events?.emit?.(error_event_key, {
//       level: 'error',
//       message: 'Failed to copy.',
//       details: err?.message || '',
//       event_source,
//     });
//     return false;
//   }
// }

