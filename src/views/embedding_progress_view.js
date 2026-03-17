import { SmartItemView } from '../../views/smart_item_view.js';
import { render as render_embedding_progress } from '../components/embedding_progress.js';

export class EmbeddingProgressView extends SmartItemView {
  static get view_type() { return 'smart-embedding-progress-view'; }
  static get display_text() { return 'Embedding progress'; }
  static get icon_name() { return 'gauge'; }
  static get default_open_location() { return 'right'; }

  async initialize() {
    this.container.empty?.();
    await this.render_view();
  }

  async render_view(params = {}, container = this.container) {
    if (!container) return;
    const view_fragment = await render_embedding_progress.call(this.env.smart_view, this.env, {
      view: this,
      ...params,
    });
    container.empty?.();
    container.appendChild(view_fragment);
  }
}
