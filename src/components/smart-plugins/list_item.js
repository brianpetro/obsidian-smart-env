import {
  MarkdownRenderer,
  Menu,
  ToggleComponent,
  setIcon,
} from 'obsidian';

/**
 * @param {import('./list').PluginListItem} item
 */
export function build_html(item, params = {}) {
  if (item.has_group_ui) {
    return build_group_html(item, params);
  }

  const row_state = item.computed_state.row;
  return build_row_html(item, {
    item_type: item.display_item_type,
    name: item.formatted_name,
    icon_name: item.get_track_icon_name(item.display_item_type),
    meta_text: item.get_track_meta_text(item.display_item_type),
    subscription_status_text: item.subscription_status_text,
    control_state: row_state?.control_state || 'can_install',
  });
}

function build_group_html(item, params = {}) {
  const core_state = item.get_track_state('core');
  const pro_state = item.get_track_state('pro');

  return `<div class="setting-group smart-plugins-item-group smart-plugins-item-group-combined" data-group-size="2">
    <div class="setting-items">
      ${build_row_html(item, {
        item_type: 'core',
        track_item_type: 'core',
        name: item.get_track_name('core'),
        icon_name: item.get_track_icon_name('core'),
        meta_text: item.get_track_meta_text('core'),
        subscription_status_text: '',
        control_state: core_state?.control_state || 'cant_install',
      })}
      ${build_row_html(item, {
        item_type: 'pro',
        track_item_type: 'pro',
        name: item.get_track_name('pro'),
        icon_name: item.get_track_icon_name('pro'),
        meta_text: item.get_track_meta_text('pro'),
        subscription_status_text: item.get_track_subscription_status_text('pro'),
        control_state: pro_state?.control_state || 'cant_install',
      })}
    </div>
  </div>`;
}

function build_row_html(item, row = {}) {
  const item_type = row.item_type || item.display_item_type;
  const control_state = row.control_state || item.computed_state.row?.control_state || 'can_install';
  const icon_html = row.icon_name
    ? `<span class="smart-plugins-item-icon" data-icon-name="${row.icon_name}" aria-hidden="true"></span>`
    : ''
  ;
  const meta_html = row.meta_text
    ? `<div class="smart-plugins-item-meta">${row.meta_text}</div>`
    : ''
  ;
  const subscription_state_html = row.subscription_status_text
    ? `<div class="smart-plugins-item-subscription-state">${row.subscription_status_text}</div>`
    : ''
  ;
  const track_item_type_attr = row.track_item_type
    ? ` data-track-item-type="${row.track_item_type}"`
    : ''
  ;
  const title_class = item_type === 'core' ? 'smart-badge core-badge' : '';
  const pro_badge_label = `Learn about ${row.name || item.formatted_name || 'this plugin'} Pro`;
  const pro_badge_html = item_type === 'pro'
    ? `<button type="button" class="smart-plugin-track-badge smart-plugin-pro-badge" data-smart-plugins-pro-badge data-source="${get_pro_badge_source(item)}" aria-label="${pro_badge_label}" title="${pro_badge_label}">Pro</button>`
    : ''
  ;

  return `<div class="setting-item pro-plugins-list-item" data-item-type="${item_type}" data-item-state="${control_state}" data-row-control-state="${control_state}"${track_item_type_attr}>
    <div class="setting-item-info">
      <div class="setting-item-name ${title_class}">
        ${icon_html}<span class="smart-plugins-item-title">${row.name || ''}</span>${pro_badge_html}
      </div>
      ${meta_html}
      <div class="setting-item-description smart-plugins-item-description markdown-rendered"></div>
      ${subscription_state_html}
    </div>
    <div class="setting-item-control"></div>
  </div>`;
}

function get_pro_badge_source(item) {
  const plugin_id = String(item?.plugin_id || '').trim();
  return plugin_id ? `plugin-store-${plugin_id}` : 'plugin-store-listing';
}

/**
 * @param {import('./list').PluginListItem} item
 */
export async function render(item, params = {}) {
  const html = build_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, item, container, params);
  return container;
}

/**
 * @param {import('./list').PluginListItem} item
 */
export async function post_process(item, container, params = {}) {
  const rows = item.has_group_ui
    ? Array.from(container.querySelectorAll('.pro-plugins-list-item[data-track-item-type]'))
    : [container]
  ;

  for (const row of rows) {
    const track_item_type = row.getAttribute('data-track-item-type') || '';
    const item_type = track_item_type || row.getAttribute('data-item-type') || item.display_item_type;
    const icon_el = row.querySelector('.smart-plugins-item-icon');
    const icon_name = icon_el?.getAttribute('data-icon-name') || '';
    if (icon_el && icon_name) {
      setIcon(icon_el, icon_name);
    }

    const description_container = row.querySelector('.setting-item-description');
    await render_description.call(this, item, description_container, get_row_description(item, track_item_type), params);

    const control_container = row.querySelector('.setting-item-control');
    if (!control_container) continue;

    const controls = await render_controls.call(this, item, {
      ...params,
      item_type,
      track_item_type,
    });

    this.empty(control_container);
    if (controls) control_container.appendChild(controls);
  }

  return container;
}

function get_row_description(item, track_item_type = '') {
  const safe_track_item_type = String(track_item_type || '').trim();
  if (safe_track_item_type) {
    return item.get_track_description(safe_track_item_type);
  }

  return item.formatted_description;
}

async function render_description(item, container, markdown = '', params = {}) {
  if (!container) return;

  this.empty(container);
  const safe_markdown = String(markdown || '').trim();
  if (!safe_markdown) return;

  const app = params.app || item.app || item.env?.obsidian_app || window.app;
  const component = item.env?.main || item.env?.plugin || null;
  await MarkdownRenderer.render(app, safe_markdown, container, '', component);
  container.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_external');
    // if no utm_source param, add one for tracking
    try {
      const url = new URL(a.href);
      if (!url.searchParams.has('utm_source')) {
        url.searchParams.set('utm_source', 'plugin_list_description');
        a.href = url.toString();
      }
    } catch (e) {
      // ignore invalid URLs
    }
  });
}

function build_controls_html(item, params = {}) {
  const item_type = String(params.item_type || params.track_item_type || item.display_item_type).trim();
  const control_specs = params.track_item_type
    ? item.get_track_control_specs(params.track_item_type)
    : item.control_specs
  ;
  const link_items = item.get_track_link_items(item_type);
  const track_name = item.get_track_name(item_type);
  const menu_label = `Open ${track_name || 'plugin'} links`;
  const menu_button_html = link_items.length
    ? `<button class="smart-plugins-menu-button" aria-label="${menu_label}" title="${menu_label}"></button>`
    : ''
  ;

  return `<div class="smart-plugins-list-item-controls">${control_specs.map(build_control_html).join('')}${menu_button_html}</div>`;
}

async function render_controls(item, params = {}) {
  const html = build_controls_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process_controls.call(this, item, container, params);
  return container;
}

async function post_process_controls(item, container, params = {}) {
  const item_type = String(params.item_type || params.track_item_type || item.display_item_type).trim();
  const link_items = item.get_track_link_items(item_type);
  const menu_button = container.querySelector('.smart-plugins-menu-button');
  if (menu_button) {
    setIcon(menu_button, 'menu');
    menu_button.addEventListener('click', (event) => {
      const menu = new Menu(item.app);
      link_items.forEach((link_item) => {
        menu.addItem((menu_item) => {
          menu_item
            .setTitle(link_item.title)
            .setIcon(link_item.icon)
            .onClick(() => {
              item.open_track_link_url(item_type, link_item.url, params);
            })
          ;
        });
      });
      menu.showAtMouseEvent(event);
    });
  }

  const toggle_controls = container.querySelectorAll('[data-control-type="toggle"]');
  for (const toggle_control of toggle_controls) {
    const toggle_host = toggle_control.querySelector('.smart-plugins-toggle-host');
    if (!toggle_host) continue;

    const toggle_item_type = toggle_control.getAttribute('data-item-type') || item_type;
    const toggle_value = toggle_control.getAttribute('data-value') === 'true';
    const toggle_disabled = toggle_control.getAttribute('data-disabled') === 'true';
    const toggle_label = toggle_control.getAttribute('data-label') || 'Enable plugin';
    const toggle = new ToggleComponent(toggle_host)
      .setValue(toggle_value)
      .setDisabled(toggle_disabled)
    ;
    toggle.toggleEl?.setAttribute?.('aria-label', toggle_label);
    toggle.setTooltip?.(toggle_label);
    toggle.onChange(async (next_value) => {
      toggle.setDisabled(true);
      await item.handle_toggle(toggle_item_type, next_value, params);
      toggle.setValue(item.installed_type === toggle_item_type && item.is_enabled);
      toggle.setDisabled(toggle_disabled);
    });
  }

  const buttons = container.querySelectorAll('button[data-action]');
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const action = button.getAttribute('data-action');
      if (!action) return;

      const busy_text = params.track_item_type
        ? item.get_busy_text_for_track(params.track_item_type, action)
        : item.get_busy_text(action)
      ;
      if (busy_text) {
        await run_busy_action(button, async () => {
          if (params.track_item_type) {
            await item.handle_track_action(params.track_item_type, action, params);
            return;
          }
          await item.handle_action(action, params);
        }, busy_text);
        return;
      }

      if (params.track_item_type) {
        await item.handle_track_action(params.track_item_type, action, params);
        return;
      }

      await item.handle_action(action, params);
    });
  }

  return container;
}

function build_control_html(control_spec) {
  if (control_spec.type === 'status') {
    return `<span class="core-installed-text">${control_spec.text}</span>`;
  }

  if (control_spec.type === 'toggle') {
    return `<div class="smart-plugins-toggle-control" data-control-type="toggle" data-item-type="${control_spec.item_type || ''}" data-value="${control_spec.value === true}" data-disabled="${control_spec.disabled === true}" data-label="${control_spec.text || 'Enable plugin'}">
      <span class="smart-plugins-toggle-label">${control_spec.text || ''}</span>
      <span class="smart-plugins-toggle-host"></span>
    </div>`;
  }

  const class_name = control_spec.variant === 'primary' ? 'mod-cta' : '';
  const title_attr = control_spec.title
    ? ` title="${control_spec.title}" aria-label="${control_spec.title}"`
    : ''
  ;
  return `<button class="${class_name}" data-action="${control_spec.action}"${title_attr}>${control_spec.text}</button>`;
}

async function run_busy_action(button, callback, busy_text) {
  if (!button || typeof callback !== 'function') return;

  const idle_text = button.textContent;
  button.disabled = true;
  if (busy_text) button.textContent = busy_text;

  try {
    await callback();
  } finally {
    button.disabled = false;
    button.textContent = idle_text;
  }
}
