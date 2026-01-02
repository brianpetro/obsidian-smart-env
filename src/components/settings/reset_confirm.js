import { reset_env_settings } from '../../utils/reset_env_settings.js';

/**
 * Builds an inline confirmation row for resetting Smart Env settings.
 * Hides the original reset button until the confirmation row is dismissed.
 * @param {import('../../../smart_env.js').SmartEnv} env
 * @param {Object} [params={}]
 * @param {HTMLElement} params.container
 * @param {Function} [params.reset_env_settings_fn]
 * @param {Function} [params.create_row]
 * @param {Object} [params.display_values]
 * @returns {Object|null}
 */
export function create_reset_confirm_ui(env, params = {}) {
  const {
    container,
    reset_env_settings_fn = reset_env_settings,
    create_row = create_dom_confirm_row,
    display_values = { hidden: 'none', shown: 'inline-block' },
  } = params;
  if (!container) return null;

  const reset_btn = container.querySelector?.('button');
  if (!reset_btn) return null;

  remove_existing_row(container);

  const { row, message_el, cancel_btn, confirm_btn } = create_row(container);

  toggle_display(reset_btn, false, display_values);

  const close_row = () => {
    row?.remove?.();
    toggle_display(reset_btn, true, display_values);
  };

  cancel_btn?.addEventListener?.('click', () => close_row(), { once: true });

  confirm_btn?.addEventListener?.('click', async () => {
    if (confirm_btn) {
      confirm_btn.disabled = true;
      confirm_btn.textContent = 'Resetting...';
    }
    await reset_env_settings_fn(env);
    if (message_el) {
      message_el.textContent = 'Settings reset. Reopen this tab to review defaults.';
    }
    if (confirm_btn?.style) confirm_btn.style.display = display_values.hidden;
    if (cancel_btn) cancel_btn.textContent = 'Close';
    cancel_btn?.addEventListener?.('click', () => close_row(), { once: true });
  });

  return { row, reset_btn, message_el, cancel_btn, confirm_btn };
}

function remove_existing_row(container) {
  container?.querySelector?.('.sc-inline-confirm-row')?.remove?.();
}

function toggle_display(el, should_show, display_values) {
  if (!el?.style) return;
  el.style.display = should_show ? display_values.shown : display_values.hidden;
}

function create_dom_confirm_row(container) {
  const row = container.createEl?.('div', { cls: 'sc-inline-confirm-row' });
  const message_el = row?.createEl?.('span', { text: 'Reset Smart Environment settings to defaults?' });
  const cancel_btn = row?.createEl?.('button', { text: 'Cancel' });
  const confirm_btn = row?.createEl?.('button', { text: 'Reset', cls: 'mod-warning' });
  return { row, message_el, cancel_btn, confirm_btn };
}
