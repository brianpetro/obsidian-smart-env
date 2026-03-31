import { compare_versions } from 'smart-environment/utils/compare_versions.js';
const min_plugin_versions_by_id = {
  'smart-connections': '4.3.0',
  'smart-context': '3.1.0',
  'smart-chatgpt': '1.3.0',
  'smart-chat': '1.4.0',
  'smart-templates': '2.1.0',
};

class PsuedoEnv {
  after_load() {
    for (let i = 0; i < this.mains.length; i++) {
      const plugin = this[this.mains[i]];
      const plugin_id = plugin.manifest?.id || 'unknown-plugin';
      const min_version = min_plugin_versions_by_id[plugin_id];
      if (min_version && compare_versions(plugin.manifest.version, min_version) === -1) {
        const notice_message = `Detected outdated Smart Plugin (${plugin_id}). Minimum required version for ${plugin_id} is v${min_version}. Please update then restart Obsidian to to use ${plugin_id}.`;
        const outdated_payload = {
          level: 'attention',
          plugin_id,
          message: notice_message,
          event_source: 'SmartEnv.create',
          btn_text: 'Browse Smart Plugins',
          btn_callback: this._registered_browse_smart_plugins_command,
        };
        this.events.emit('smart_env:restart_required', outdated_payload);
        this.update_plugin_ids[plugin_id] = true;
        console.warn(`SmartEnv: ${notice_message}`, {outdated_payload});
      }
    }
  }
}