import { ItemView, Platform } from "obsidian";
import { wait_for_env_to_load } from "../utils/wait_for_env_to_load.js";

/**
 * Adds Smart Environment functionality to Obsidian ItemView.
 * @extends ItemView
 */
export class SmartItemView extends ItemView {
  /**
   * Creates an instance of SmartItemView.
   * @param {any} leaf
   * @param {any} plugin
   */
  constructor(leaf, plugin) {
    super(leaf);
    this.app = plugin.app;
    this.plugin = plugin;
  }

  /**
   * The unique view type. Must be implemented in subclasses.
   * @returns {string}
   */
  static get view_type() {
    throw new Error("view_type must be implemented in subclass");
  }

  /**
   * The display text for this view. Must be implemented in subclasses.
   * @returns {string}
   */
  static get display_text() {
    throw new Error("display_text must be implemented in subclass");
  }

  /**
   * The icon name for this view.
   * @returns {string}
   */
  static get icon_name() {
    return "smart-connections";
  }

  /**
   * Registers this ItemView subclass against a plugin instance and
   * installs ergonomic accessors, an open helper, and an `${view_type}:open` listener.
   *
   * Usage from a plugin class:
   *   SubClass.register_item_view(this);
   *
   * This will:
   * - call plugin.registerView(view_type, ...)
   * - add a command "Open: <display_text> view"
   * - define a getter on plugin: plugin[method_name] -> the view instance
   * - define a method on plugin: plugin["open_" + method_name]() -> opens the view
   * - listen for env events named `${view_type}:open` and open the view when emitted
   *
   * @param {import('obsidian').Plugin} plugin
   * @returns {{method_name:string, open_method_name:string, event_name:string}}
   */
  static register_item_view(plugin) {
    const View = /** @type {typeof SmartItemView} */ (this);

    // Register the view with Obsidian
    plugin.registerView(View.view_type, (leaf) => new View(leaf, plugin));

    // Add a matching command for opening this view
    plugin.addCommand({
      id: View.view_type,
      name: "Open: " + View.display_text + " view",
      callback: () => {
        View.open(plugin.app.workspace);
      }
    });

    // Derive ergonomic API on the plugin instance
    const method_name = View.view_type.replace(/^smart-/, "").replace(/-/g, "_");
    const open_method_name = "open_" + method_name;

    if (!Object.getOwnPropertyDescriptor(plugin, method_name)) {
      Object.defineProperty(plugin, method_name, {
        configurable: true,
        enumerable: false,
        get: () => View.get_view(plugin.app.workspace)
      });
    }

    // Always (re)bind the open method to the latest View.open behavior
    plugin[open_method_name] = () => View.open(plugin.app.workspace);

    // Register `${view_type}:open` event listener on SmartEnv events, if available
    const event_name = `${method_name}:open`;
    const handler = (payload) => {
      const active = typeof payload?.active === "boolean" ? payload.active : true;
      View.open(plugin.app.workspace, active);
    };
    const unsubscribe = plugin?.env?.events.on(event_name, handler);

    // Ensure cleanup on plugin unload
    if (typeof plugin.register === "function" && typeof unsubscribe === "function") {
      plugin.register(() => unsubscribe());
    }

    return { method_name, open_method_name, event_name };
  }

  /**
   * Retrieves the Leaf instance for this view type if it exists.
   * @param {import("obsidian").Workspace} workspace
   * @returns {import("obsidian").WorkspaceLeaf | undefined}
   */
  static get_leaf(workspace) {
    return workspace
      .getLeavesOfType(this.view_type)[0];
  }

  /**
   * Retrieves the view instance if it exists.
   * @param {import("obsidian").Workspace} workspace
   * @returns {SmartItemView | undefined}
   */
  static get_view(workspace) {
    const leaf = this.get_leaf(workspace);
    return leaf ? leaf.view : undefined;
  }

  /**
   * Opens the view. If `this.default_open_location` is "root",
   * it opens (or reveals) in a root leaf; otherwise in the right leaf.
   *
   * @param {import("obsidian").Workspace} workspace
   * @param {boolean} [active=true]
   */
  static open(workspace, params = {}) {
    const {
      active = true,
    } = params;
    const existing_leaf = this.get_leaf(workspace);

    if (this.default_open_location === "root") {
      // If there's already a leaf with this view, just set it active.
      // Otherwise, create/open in a leaf in the root (left/main) area.
      if (existing_leaf) {
        existing_leaf.setViewState({ type: this.view_type, active });
      } else {
        workspace.getLeaf(false).setViewState({ type: this.view_type, active });
      }
    } else {
      // If there's already a leaf with this view, just set it active.
      // Otherwise, create/open in the right leaf.
      if (existing_leaf) {
        existing_leaf.setViewState({ type: this.view_type, active });
      } else {
        workspace.getRightLeaf(false).setViewState({
          type: this.view_type,
          active,
        });
      }

      // Reveal the right split if it's collapsed
      if (workspace.rightSplit?.collapsed) {
        workspace.rightSplit.toggle();
      }
    }

    // trigger render
    setTimeout(() => {
      this.get_view(workspace)?.render_view(params);
    }, 100);
  }

  static is_open(workspace) { return this.get_leaf(workspace)?.view instanceof this; }
  // instance
  getViewType() { return this.constructor.view_type; }
  getDisplayText() { return this.constructor.display_text; }
  getIcon() { return this.constructor.icon_name; }
  async onOpen() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
  }
  async initialize() {
    await wait_for_env_to_load(this);
    this.container.empty();
    this.register_plugin_events();
    this.app.workspace.registerHoverLinkSource(this.constructor.view_type, { display: this.getDisplayText(), defaultMod: true });
    this.render_view();
    if(Platform.isMobile) {
      const status_bar_container = this.containerEl.querySelector('.status-bar-mobile')
        ?? this.containerEl.createDiv({cls: 'status-bar-mobile'});
      ;
      status_bar_container.empty();
      const status_bar_item = status_bar_container.createDiv({cls: 'status-bar-item'});
      this.env.smart_components.render_component('status_bar', this.env)
        .then((el) => status_bar_item.appendChild(el))
      ;
    }
  }
  register_plugin_events() { /* OVERRIDE AS NEEDED */ }
  render_view(params = {}) { throw new Error("render_view must be implemented in subclass"); }
  get container() { return this.containerEl.children[1]; }
  get env() { return this.plugin.env; }
  async open_settings(){
    await this.app.setting.open();
    await this.app.setting.openTabById(this.plugin.manifest.id);
  }
}