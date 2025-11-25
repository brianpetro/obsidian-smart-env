/**
 * Removes legacy "smart-plugins" installs from the Obsidian vault and disables them in-app.
 *
 * @param {Object} params
 * @param {import('obsidian').App} params.app - Obsidian app reference.
 * @param {string[]} [params.plugin_ids] - Plugin ids to remove.
 * @returns {Promise<void>}
 */
export async function remove_smart_plugins_plugin({ app, plugin_ids = [] } = {}) {
  if (!app) return;
  const adapter = app.vault?.adapter;
  for (const plugin_id of plugin_ids) {
    const disabled = await disable_plugin_if_present(app.plugins, plugin_id);
    if (disabled) console.warn(`Disabled legacy plugin: ${plugin_id}`);
    const removed = await remove_plugin_folder(adapter, plugin_id);
    if (removed) console.warn(`Removed legacy plugin: ${plugin_id}`);
  }
}

async function disable_plugin_if_present(app_plugins, plugin_id) {
  if (!app_plugins) return;
  const has_plugin = Boolean(
    app_plugins.plugins?.[plugin_id]
    || app_plugins.enabledPlugins?.has?.(plugin_id)
    || (app_plugins.manifests && plugin_id in app_plugins.manifests)
  );
  if (!has_plugin) return;
  if (app_plugins.plugins?.[plugin_id]) {
    await app_plugins.unloadPlugin?.(plugin_id);
  }
  if (app_plugins.disablePluginAndSave) {
    await app_plugins.disablePluginAndSave(plugin_id);
  }
  if (app_plugins.enabledPlugins?.has?.(plugin_id)) {
    app_plugins.enabledPlugins.delete(plugin_id);
  }
  if (app_plugins.manifests && plugin_id in app_plugins.manifests) {
    delete app_plugins.manifests[plugin_id];
  }
  await app_plugins.loadManifests?.();
  return true;
}

async function remove_plugin_folder(adapter, plugin_id) {
  if (!adapter?.exists) return;
  const plugin_path = `.obsidian/plugins/${plugin_id}`;
  const exists = await adapter.exists(plugin_path);
  if (!exists) return;
  if (adapter.rmdir) {
    await adapter.rmdir(plugin_path, true);
    return;
  }
  if (adapter.list && adapter.remove) {
    const stack = [plugin_path];
    while (stack.length) {
      const current_path = stack.pop();
      const listing = await adapter.list(current_path);
      for (const file of listing?.files || []) {
        await adapter.remove(`${current_path}/${file}`);
      }
      for (const folder of listing?.folders || []) {
        stack.push(`${current_path}/${folder}`);
      }
    }
    await adapter.remove(plugin_path);
    return true;
  }
}
