import { Platform } from 'obsidian';
import { SmartItemView } from '../../views/smart_item_view.js';
import { render as render_env_status_component } from '../components/env_status.js';

/**
 * Mobile-friendly Smart Environment status surface.
 *
 * Renders before the environment is fully loaded so deferred mobile loading can
 * show collection/import/embed progress without needing the view to be closed
 * and reopened.
 */
export class EnvStatusView extends SmartItemView {
  static view_type = 'smart-env-status-view';
  static display_text = 'Smart Environment Status';
  static get icon_name() { return 'gauge'; }

  static get default_open_location() {
    return Platform.isMobile ? 'root' : 'right';
  }

  static get wait_for_env() {
    return false;
  }

  async onOpen() {
    this.titleEl?.setText?.('Smart Environment');
    await super.onOpen();
  }

  register_plugin_events() {
    if (this._env_status_view_cleanup_registered) return;
    this._env_status_view_cleanup_registered = true;

    this.register(() => {
      this.stop_renderer_upgrade_polling();
      this._active_renderer_key = null;
      this._last_render_params = null;
      this._render_component_promise = null;
      this._env_status_view_cleanup_registered = false;
    });
  }

  render_view(params = {}) {
    this._last_render_params = params;
    this.render_component_view(params);
  }

  async render_component_view(params = {}) {
    const container = this.container;
    if (!container) return;
    if (this._render_component_promise) return this._render_component_promise;

    this._render_component_promise = render_env_status(this, params)
      .then(({ component_el, renderer_key }) => {
        if (!component_el) return;
        if (this.container !== container) return;

        empty_element(container);
        container.appendChild(component_el);
        this._active_renderer_key = renderer_key;

        if (renderer_key === 'smart_components') {
          this.stop_renderer_upgrade_polling();
        } else {
          this.start_renderer_upgrade_polling();
        }
      })
      .catch((error) => {
        console.error('Failed to render env_status component', error);
      })
      .finally(() => {
        this._render_component_promise = null;
      })
    ;

    return this._render_component_promise;
  }

  start_renderer_upgrade_polling() {
    if (this._env_status_renderer_upgrade_interval) return;

    this._env_status_renderer_upgrade_interval = setInterval(() => {
      if (!can_render_via_smart_components(this.env)) return;
      if (this._active_renderer_key === 'smart_components') {
        this.stop_renderer_upgrade_polling();
        return;
      }
      this.render_component_view(this._last_render_params || {});
    }, 500);
  }

  stop_renderer_upgrade_polling() {
    if (!this._env_status_renderer_upgrade_interval) return;
    clearInterval(this._env_status_renderer_upgrade_interval);
    this._env_status_renderer_upgrade_interval = null;
  }

  async onClose() {
    this.stop_renderer_upgrade_polling();
  }
}

/**
 * @param {any} env
 * @returns {boolean}
 */
function can_render_via_smart_components(env) {
  return Boolean(env?.config?.components?.env_status)
    && typeof env?.smart_components?.render_component === 'function'
  ;
}

/**
 * @param {EnvStatusView} view
 * @param {object} [params={}]
 * @returns {Promise<{component_el: HTMLElement|null, renderer_key: 'direct'|'smart_components'}>}
 */
async function render_env_status(view, params = {}) {
  const component_params = {
    ...params,
    live_updates: true,
    event: params.event,
    event_key: params.event_key,
  };

  if (can_render_via_smart_components(view.env)) {
    try {
      const component_el = await view.env.smart_components.render_component('env_status', view.env, component_params);
      return {
        component_el,
        renderer_key: 'smart_components',
      };
    } catch (error) {
      console.error('Failed to render env_status via smart_components, falling back to direct component render', error);
    }
  }

  return {
    component_el: await render_env_status_component.call(view.env.smart_view, view.env, component_params),
    renderer_key: 'direct',
  };
}

/**
 * @param {HTMLElement} element
 * @returns {void}
 */
function empty_element(element) {
  if (!element) return;
  if (typeof element.empty === 'function') {
    element.empty();
    return;
  }
  element.replaceChildren?.();
}
