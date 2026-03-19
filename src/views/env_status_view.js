import { SmartItemView } from '../../views/smart_item_view.js';
import { render as render_env_status } from '../components/env_status.js';

export class EnvStatusView extends SmartItemView {
  static get view_type() { return 'smart-env-status-view'; }
  static get display_text() { return 'Environment status'; }
  static get icon_name() { return 'gauge'; }
  static get default_open_location() { return 'right'; }

  async initialize() {
    this.container.empty?.();
    await this.render_view();
  }

  async render_view(params = {}, container = this.container) {
    if (!container) return;
    const view_fragment = await render_env_status.call(this.env.smart_view, this.env, {
      view: this,
      ...params,
    });
    container.empty?.();
    container.appendChild(view_fragment);
  }
}
