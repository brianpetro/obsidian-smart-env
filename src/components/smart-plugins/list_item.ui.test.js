import test from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('Smart Plugins rows render icons, metadata, a link menu, and toggle controls', (t) => {
  const dir_name = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(dir_name, 'list_item.js'), 'utf8');
  const styles = fs.readFileSync(path.join(dir_name, 'style.css'), 'utf8');

  t.true(source.includes('ToggleComponent'));
  t.true(source.includes('new Menu(item.app)'));
  t.true(source.includes('smart-plugins-menu-button'));
  t.true(source.includes("setIcon(menu_button, 'menu')"));
  t.true(source.includes('smart-plugins-item-icon'));
  t.true(source.includes('smart-plugins-item-meta'));
  t.true(source.includes('smart-plugins-toggle-control'));
  t.true(source.includes('data-smart-plugins-pro-badge'));
  t.true(source.includes('data-source="${get_pro_badge_source(item)}"'));
  t.true(source.includes('smart-plugin-pro-badge'));
  t.true(source.includes("const menu_label = `Open ${track_name || 'plugin'} links`;"));
  t.false(source.includes('https://smartconnections.app/pro-plugins/'));
  t.true(source.includes('control_spec.title'));
  t.true(source.includes('aria-label="${control_spec.title}"'));
  t.true(source.includes("${control_specs.map(build_control_html).join('')}${menu_button_html}"));
  t.false(source.includes("${menu_button_html}${control_specs.map(build_control_html).join('')}"));
  t.false(source.includes('smart-plugins-details-button'));
  t.true(styles.includes('.smart-env-pro-plugins-modal .pro-plugins-container'));
  t.true(styles.includes('[data-row-control-state="included_in_pro"]'));
  t.true(styles.includes('padding-block: var(--size-4-2)'));
  t.true(styles.includes('@media (max-width: 960px)'));
  t.true(styles.includes('.smart-plugins-login-actions'));
  t.true(styles.includes('.smart-plugins-marketing-section'));
  t.true(styles.includes('.smart-plugin-pro-badge'));
  t.true(styles.includes('.smart-plugins-track-guide-item'));
  t.false(styles.includes('.smart-badge.pro-badge::after'));
  t.true(styles.includes('.smart-plugins-referral .setting-item + .setting-item'));
});
