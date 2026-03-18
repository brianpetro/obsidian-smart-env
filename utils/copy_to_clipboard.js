import { Platform } from 'obsidian';

/**
 * Copy text to clipboard in a cross-platform manner.
 * On mobile, Node/Electron APIs are unavailable.
 */

export async function copy_to_clipboard(text, params = {}) {
  const {
    env = null,
    event_source = 'copy_to_clipboard',
    success_event_key = 'clipboard:copied',
    error_event_key = 'clipboard:copy_failed',
    unavailable_event_key = 'clipboard:copy_unavailable',
  } = params;

  try {
    // First try standard browser clipboard API
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }

    // If not on mobile, attempt Electron's clipboard
    else if (!Platform.isMobile) {
      const { clipboard } = require('electron');
      clipboard.writeText(text);
    }

    // Otherwise, no known method for copying
    else {
      env?.events?.emit?.(unavailable_event_key, {
        level: 'warning',
        message: 'Unable to copy text: no valid method found.',
        event_source,
      });
      return false;
    }
    env?.events?.emit?.(success_event_key, {
      level: 'info',
      message: `Copied ${text.length} characters to clipboard`,
      event_source,
    });
    return true;
  } catch (err) {
    console.error('Failed to copy text:', err);
    env?.events?.emit?.(error_event_key, {
      level: 'error',
      message: 'Failed to copy.',
      details: err?.message || '',
      event_source,
    });
    return false;
  }
}
