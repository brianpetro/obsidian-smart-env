import { ItemView } from "obsidian";
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
   * Retrieves the Leaf instance for this view type if it exists.
   * @param {import("obsidian").Workspace} workspace
   * @returns {import("obsidian").WorkspaceLeaf | undefined}
   */
  static get_leaf(workspace) {
    return workspace
      .getLeavesOfType(this.view_type)[0]
  }

  /**
   * Retrieves the view instance if it exists.
   * @param {import("obsidian").Workspace} workspace
   * @returns {SmartObsidianView | undefined}
   */
  static get_view(workspace) {
    const leaf = this.get_leaf(workspace);
    return leaf ? leaf.view : undefined;
  }

  /**
   * Opens the view. If `this.default_open_location` is `'root'`,
   * it will open (or reveal) in a "root" leaf; otherwise, it will
   * open (or reveal) in the right leaf.
   *
   * @param {import("obsidian").Workspace} workspace
   * @param {boolean} [active=true] - Whether the view should be focused when opened.
   */
  static open(workspace, active = true) {
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
      this.get_view(workspace)?.render_view();
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
  }
  register_plugin_events() { /* OVERRIDE AS NEEDED */ }
  render_view() { throw new Error("render_view must be implemented in subclass"); }
  get container() { return this.containerEl.children[1]; }
  get env() { return this.plugin.env; }
  async open_settings(){
    await this.app.setting.open();
    await this.app.setting.openTabById(this.plugin.manifest.id);
  }
}