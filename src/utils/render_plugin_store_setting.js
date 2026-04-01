import { Setting } from 'obsidian';

export function render_plugin_store_setting(scope, container) {
  if (!container) return null;
  container.empty?.();

  const setting = new Setting(container)
    .setName('Browse Smart Plugins')
    .setDesc('Discover Core (free) and Pro Smart Plugins to supercharge your Obsidian AI experience.');

  setting.addButton((btn) => {
    btn.setButtonText('Browse Smart Plugins');
    btn.onClick(() => {
      scope.env?.events?.emit?.('smart_plugins:browse', {
        event_source: `${scope.id}-settings`,
      });
    });
  });

  return setting;
}
