import { Platform } from 'obsidian';

export function render_pre_env_load(scope) {
  const container = scope.containerEl;
  const env = scope.env;
  if (env.state !== 'loaded') {
    if (env.state === 'loading') {
      container.createEl('p', { text: 'Smart Environment is loading…' });
    } else {
      container.createEl('p', { text: 'Smart Environment not yet initialized.' });
      const load_btn = container.createEl('button', { text: 'Load Smart Environment' });
      load_btn.addEventListener('click', async () => {
        load_btn.disabled = true;
        load_btn.textContent = 'Loading Smart Environment…';
        if (Platform.isMobile && typeof env.start_mobile_env_load === 'function') {
          await env.start_mobile_env_load({ source: 'settings_tab' });
          return;
        }
        await env.load(true);
      });
    }
  }
}
