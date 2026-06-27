import { SmartNoteInspectModal } from '../../../views/source_inspector.js';

/**
 * Inspect the Smart Source backing the active note.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @returns {boolean}
 */
export function env_inspect_active_note() {
  const plugin = this.main;
  const active_file = plugin?.app?.workspace?.getActiveFile?.();
  if (!active_file) {
    this?.events?.emit?.('status_bar:inspect_active_note_missing', {
      level: 'warning',
      message: 'No active note found',
      event_source: 'env_inspect_active_note',
    });
    return false;
  }

  const src = this.smart_sources?.get?.(active_file.path);
  if (!src) {
    this?.events?.emit?.('status_bar:inspect_source_missing', {
      level: 'warning',
      message: 'Active note is not indexed by Smart Environment',
      event_source: 'env_inspect_active_note',
    });
    return false;
  }

  new SmartNoteInspectModal(plugin, src).open();
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title: 'Inspect active note',
    icon: 'search',
    order: 10,
  },
};
