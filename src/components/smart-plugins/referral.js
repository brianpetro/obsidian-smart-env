import { Setting } from 'obsidian';
import { copy_to_clipboard } from '../../utils/copy_to_clipboard.js';
import { fetch_referral_stats } from '../../utils/smart_plugins.js';
import {
  build_onboarding_start_url,
  get_onboarding_signup_setting_copy,
} from './onboarding_signup.js';

export function build_html(env, params = {}) {
  return `<div class="smart-plugins-referral-component"></div>`;
}

export async function render(env, params = {}) {
  const html = build_html.call(this, env, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, env, container, params);
  return container;
}

export async function post_process(env, container, params = {}) {
  const render_onboarding_signup_section = () => {
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
          event_source: 'smart_plugins_referral',
        });
      });
    });
  };

  const emit_referral_event = (event_key) => {
    env?.events?.emit?.(event_key, {
      event_source: 'smart_plugins_referral',
    });
  };

  render_onboarding_signup_section();

  const token = String(params.token || '').trim();
  if (!token) {
    const setting = new Setting(container)
      .setName('Give $30 off Pro. Get 30 days of Pro')
      .setDesc('Start a free trial to unlock your referral link.')
    ;

    setting.addButton((btn) => {
      btn.setButtonText('Start free trial');
      btn.onClick(() => {
        window.open('https://smartconnections.app/pro-plugins/', '_external');
      });
    });

    return container;
  }

  const sub_exp = Number(params.sub_exp ?? 0) || 0;
  if (sub_exp && sub_exp < Date.now()) {
    return container;
  }

  try {
    const stats = await fetch_referral_stats({ token });
    const referral_link = String(stats?.referral_link || '').trim();
    if (!referral_link) return container;

    const setting = new Setting(container)
      .setName('Referral link')
      .setDesc('Give $30 off Pro. Get 30 days of Pro.')
    ;

    setting.addButton((btn) => {
      btn.setButtonText('Copy link');
      btn.onClick(async () => {
        const copied = await copy_to_clipboard(referral_link, {
          env,
          event_source: 'smart_plugins_referral.copy_link',
          success_event_key: 'referrals:copied_link_notice',
          error_event_key: 'referrals:copy_link_failed',
          unavailable_event_key: 'referrals:copy_link_unavailable',
        });
        if (copied) emit_referral_event('referrals:copied_link');
      });
    });

    setting.addButton((btn) => {
      btn.setButtonText('Open referrals');
      btn.onClick(() => {
        window.open('https://smartconnections.app/my-referrals/', '_external');
        emit_referral_event('referrals:opened_dashboard');
      });
    });
  } catch (err) {
    console.error('[smart-plugins:referral] Failed to load referral stats:', err);
  }

  return container;
}
