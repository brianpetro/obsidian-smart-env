import {
  Notice,
  Plugin,
  requestUrl,
  Platform,
} from "obsidian";
import { SmartEnv } from "./smart_env.js";
import { SmartNotices } from 'smart-notices/smart_notices.js';

export class SmartPlugin extends Plugin {
  SmartEnv = SmartEnv;
  /**
   * override in subclass to provide commands.
   * use property key to override commands in further subclasses.
   */
  get commands() {
    return {
      show_release_notes: {
        id: 'show-release-notes',
        name: 'Show release notes',
        callback: () => this.show_release_notes()
      }
    };
  }
  register_commands() {
    Object.values(this.commands).forEach((cmd) => {
      this.addCommand(cmd);
    });
  }


  /**
   * override in subclass to provide ribbon icons.
   * use property key to override ribbon icons in further subclasses.
   */
  get ribbon_icons() {
    return {};
  }
  register_ribbon_icons() {
    const icons = Object.values(this.ribbon_icons);
    for(let i = 0; i < icons.length; i++) {
      const ri = icons[i];
      this.addRibbonIcon(ri.icon_name, ri.description, ri.callback);
    }
  }

  get item_views() {
    return {};
  }
  register_item_views() {
    const views = Object.values(this.item_views);
    for(let i = 0; i < views.length; i++) {
      const ViewClass = views[i];
      if (typeof ViewClass.register_item_view === "function") {
        ViewClass.register_item_view(this);
      }
    }
  }


  /**
   * user version and first seen handling
   */
  async is_new_user() {
    const data = (await this.loadData()) || {};
    if (!data.installed_at) {
      data.installed_at = Date.now();
      await this.saveData(data);
      return true;
    }
    return false;
  }
  /**
   * Returns the last saved plugin version or an empty string.
   * @returns {Promise<string>}
   */
  async get_last_known_version() {
    const data = (await this.loadData()) || {};
    return data.last_version || '';
  }

  /**
   * Persists the provided plugin version as last shown.
   * @param {string} version
   * @returns {Promise<void>}
   */
  async set_last_known_version(version) {
    const data = (await this.loadData()) || {};
    data.last_version = version;
    await this.saveData(data);
  }

  /**
   * Determines if release notes should be shown for `current_version`.
   * @param {string} current_version
   * @returns {Promise<boolean>}
   */
  async is_new_plugin_version(current_version) {
    return (await this.get_last_known_version()) !== current_version;
  }

  /**
   * @deprecated use SmartEnv.notices instead
   */
  get notices() {
    if(this.env?.notices) return this.env.notices;
    if(!this._notices) this._notices = new SmartNotices(this.env, Notice);
    return this._notices;
  }
}