import { Setting } from 'obsidian';
import {
  build_onboarding_start_url,
  get_onboarding_signup_setting_copy,
} from './onboarding_signup.js';

export function build_html(env, params = {}) {
  return `<div class="smart-plugins-onboarding-component"></div>`;
}

export async function render(env, params = {}) {
  const html = build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, env, container, params);
  return container;
}

export async function post_process(env, container, params = {}) {
  const copy = get_onboarding_signup_setting_copy();
  const setting = new Setting(container)
    .setName(copy.name)
    .setDesc(copy.description)
  ;

  setting.addButton((btn) => {
    btn.setButtonText(copy.button_text);
    btn.onClick(() => {
      const onboarding_url = build_onboarding_start_url({ source: 'plugins_settings' });
      window.open(onboarding_url, '_external');
      env?.events?.emit?.('onboarding:opened_signup', {
        event_source: 'smart_plugins_onboarding',
      });
    });
  });

  return container;
}
