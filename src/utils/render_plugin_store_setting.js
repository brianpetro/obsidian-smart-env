import { Setting } from 'obsidian';

export function render_plugin_store_setting(scope, container) {
  if (!container) return null;
  container.empty?.();

  const setting = new Setting(container)
    .setName('Plugin store')
    .setDesc('Browse Smart Plugins, connect your account, and install Pro plugins from the dedicated modal.');

  setting.addButton((btn) => {
    btn.setButtonText('Browse Smart Plugins');
    btn.onClick(() => {
      scope.env?.open_pro_plugins_modal?.();
    });
  });

  return setting;
}
