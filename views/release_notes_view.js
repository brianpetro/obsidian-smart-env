import { MarkdownRenderer } from 'obsidian';
import { SmartItemView } from './smart_item_view.js';


export class ReleaseNotesView extends SmartItemView {
  static view_type = 'smart-release-notes-view';
  static display_text = 'Release Notes';
  static icon_name = 'file-text';
  static plugin_id = '';
  static release_notes_md = '';

  static open(workspace, version, active = true) {
    const leaf = workspace.getLeaf('tab');
    leaf.setViewState({ type: this.view_type, active, state: { version } });
  }

  onOpen() {
    this.titleEl.setText(`What's new in v${this.version}? (${this.constructor.plugin_id})`);
    this.render();
  }

  get container() {
    const content = this.containerEl?.querySelector('.view-content');
    let preview = content?.querySelector('.markdown-preview-view');
    if (!preview) {
      const main = content?.createDiv('cm-scroller is-readable-line-width');
      preview = main?.createDiv('markdown-preview-view markdown-rendered');
    }
    return preview;
  }

  async render() {
    while (!this.container) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.warn('Waiting for containerEl to be ready...', this.container);
    }

    await MarkdownRenderer.render(
      this.app,
      this.constructor.release_notes_md,
      this.container,
      '',
      this,
    );

    this.container.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_external');
    });

    requestAnimationFrame(() => this.scroll_to_version());
  }

  get version() {
    const view_version = this.leaf.viewState?.state?.version;
    if (view_version) return view_version;
    const plugin_id = this.constructor.plugin_id;
    return this.app.plugins.getPlugin(plugin_id)?.manifest.version ?? '';
  }

  scroll_to_version() {
    const matcher = build_version_matcher(this.version);
    if (!matcher) return;
    this.container.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading) => {
      if (!heading_matches_version({ matcher, heading_text: heading.textContent })) return;
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}
function escape_regex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a matcher for a semantic version heading.
 * @param {string} version
 * @returns {RegExp|null}
 */
export function build_version_matcher(version) {
  if (!version) return null;
  const safe_version = escape_regex(version);
  return new RegExp(`\\bv?${safe_version}\\b`, 'i');
}

/**
 * Check whether a heading text matches the provided version matcher.
 * @param {object} params
 * @param {RegExp|null} params.matcher
 * @param {string} params.heading_text
 * @returns {boolean}
 */
export function heading_matches_version({ matcher, heading_text }) {
  if (!matcher) return false;
  return matcher.test(heading_text ?? '');
}
