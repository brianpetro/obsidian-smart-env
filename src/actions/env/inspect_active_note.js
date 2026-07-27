import { Modal } from 'obsidian';

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

class SmartNoteInspectModal extends Modal {
  constructor(smart_connections_plugin, entity) {
    super(smart_connections_plugin.app);
    this.smart_connections_plugin = smart_connections_plugin;
    this.entity = entity;
  }

  get env() {
    return this.smart_connections_plugin.env;
  }

  onOpen() {
    this.titleEl.setText('Source inspector');
    this.modalEl?.classList?.add('smart-source-inspector-modal');
    this.render();
  }

  onClose() {
    this.modalEl?.classList?.remove('smart-source-inspector-modal');
    this.contentEl.empty();
  }

  async render() {
    this.contentEl.empty();
    const loading_el = this.contentEl.createEl('p', {
      cls: 'smart-source-inspector-modal__loading',
      text: 'Opening source inspector...',
    });
    loading_el.setAttribute('aria-live', 'polite');

    try {
      const component = await this.env.smart_components.render_component(
        'source_inspector',
        this.entity,
      );
      this.contentEl.empty();
      if (component) {
        this.contentEl.appendChild(component);
        return;
      }
      this.contentEl.createEl('p', { text: 'Failed to load source inspector.' });
    } catch (error) {
      console.error('[source_inspector] Failed to render source inspector modal', error);
      this.contentEl.empty();
      this.contentEl.createEl('p', {
        text: 'Failed to load source inspector. See the developer console for details.',
      });
    }
  }
}
