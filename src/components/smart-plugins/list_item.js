import { MarkdownRenderer, setIcon } from 'obsidian';

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
        subscription_status_text: '',
        control_state: core_state?.control_state || 'cant_install',
      })}
      ${build_row_html(item, {
        item_type: 'pro',
        track_item_type: 'pro',
        name: item.get_track_name('pro'),
        subscription_status_text: item.get_track_subscription_status_text('pro'),
        control_state: pro_state?.control_state || 'cant_install',
      })}
    </div>
  </div>`;
}

function build_row_html(item, row = {}) {
  const item_type = row.item_type || item.display_item_type;
  const control_state = row.control_state || item.computed_state.row?.control_state || 'can_install';
  const subscription_state_html = row.subscription_status_text
    ? `<div class="smart-plugins-item-subscription-state">${row.subscription_status_text}</div>`
    : ''
  ;
  const track_item_type_attr = row.track_item_type
    ? ` data-track-item-type="${row.track_item_type}"`
    : ''
  ;

  return `<div class="setting-item pro-plugins-list-item" data-item-type="${item_type}" data-item-state="${control_state}" data-row-control-state="${control_state}"${track_item_type_attr}>
    <div class="setting-item-info">
      <div class="setting-item-name ${item_type === 'core' ? 'smart-badge core-badge' : 'smart-badge pro-badge'}">${row.name || ''}</div>
      <div class="setting-item-description smart-plugins-item-description markdown-rendered"></div>
      ${subscription_state_html}
    </div>
    <div class="setting-item-control"></div>
  </div>`;
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
    const description_container = row.querySelector('.setting-item-description');
    await render_description.call(this, item, description_container, get_row_description(item, track_item_type), params);

    const control_container = row.querySelector('.setting-item-control');
    if (!control_container) continue;

    const controls = await render_controls.call(this, item, {
      ...params,
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
  const track_item_type = String(params.track_item_type || '').trim();
  const details_url = track_item_type
    ? item.get_track_details_url(track_item_type)
    : item.details_url
  ;
  const control_specs = track_item_type
    ? item.get_track_control_specs(track_item_type)
    : item.control_specs
  ;

  const details_button_html = details_url
    ? '<button class="smart-plugins-details-button" data-action="open_details" aria-label="Open details" title="Open details"></button>'
    : ''
  ;

  return `<div class="smart-plugins-list-item-controls">${details_button_html}${control_specs.map(build_control_html).join('')}</div>`;
}

async function render_controls(item, params = {}) {
  const html = build_controls_html(item, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process_controls.call(this, item, container, params);
  return container;
}

async function post_process_controls(item, container, params = {}) {
  const track_item_type = String(params.track_item_type || '').trim();

  const details_buttons = container.querySelectorAll('.smart-plugins-details-button');
  for (const details_button of details_buttons) {
    setIcon(details_button, 'info');
  }

  const buttons = container.querySelectorAll('button[data-action]');
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const action = button.getAttribute('data-action');
      if (!action) return;

      const busy_text = track_item_type
        ? item.get_busy_text_for_track(track_item_type, action)
        : item.get_busy_text(action)
      ;
      if (busy_text) {
        await run_busy_action(button, async () => {
          if (track_item_type) {
            await item.handle_track_action(track_item_type, action, params);
            return;
          }
          await item.handle_action(action, params);
        }, busy_text);
        return;
      }

      if (track_item_type) {
        await item.handle_track_action(track_item_type, action, params);
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

  const class_name = control_spec.variant === 'primary' ? 'mod-cta' : '';
  return `<button class="${class_name}" data-action="${control_spec.action}">${control_spec.text}</button>`;
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
