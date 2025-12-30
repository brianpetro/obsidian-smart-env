import { Modal, setIcon } from 'obsidian';

const MILESTONES_HELP_URL = 'https://smartconnections.app/smart-environment/settings/?utm_source=milestones_modal_help';

export class MilestonesModal extends Modal {
  constructor(app, env) {
    super(app);
    this.env = env;
  }

  async onOpen() {
    render_milestones_modal_title(this.titleEl, this.env);

    this.contentEl.empty();
    const milestones = await this.env.smart_components.render_component('milestones', this.env, {});
    this.contentEl.appendChild(milestones);
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * @param {HTMLElement} title_el
 * @param {any} env
 */
function render_milestones_modal_title(title_el, env) {
  if (!title_el) return;

  title_el.empty();
  title_el.classList.add('sc-milestones-modal__title');

  const row_el = document.createElement('div');
  row_el.className = 'sc-milestones-modal__title-row';

  const text_el = document.createElement('div');
  text_el.className = 'sc-milestones-modal__title-text';
  text_el.textContent = 'Smart Milestones';

  const help_btn_el = document.createElement('button');
  help_btn_el.type = 'button';
  help_btn_el.className = 'sc-milestones-modal__help-btn';
  help_btn_el.setAttribute('aria-label', 'Open Smart Milestones help');
  help_btn_el.setAttribute('title', 'Help');

  render_help_icon(help_btn_el);

  help_btn_el.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();

    // optional lightweight analytics hook (safe if env/events not present)
    try {
      env?.events?.emit?.('milestones:help', {});
    } catch (err) {
      // ignore
    }

    window.open(MILESTONES_HELP_URL, '_external');
  });

  row_el.appendChild(text_el);
  row_el.appendChild(help_btn_el);
  title_el.appendChild(row_el);
}

/**
 * @param {HTMLElement} icon_el
 */
function render_help_icon(icon_el) {
  const ok = set_icon_with_fallback(icon_el, ['circle-help', 'help-circle', 'help', 'info']);
  if (!ok) icon_el.textContent = '?';
}

/**
 * @param {HTMLElement} icon_el
 * @param {string[]} icon_ids
 * @returns {boolean}
 */
function set_icon_with_fallback(icon_el, icon_ids) {
  if (!icon_el) return false;

  const ids = Array.isArray(icon_ids) ? icon_ids : [];
  for (const icon_id of ids) {
    if (typeof icon_id !== 'string' || icon_id.length === 0) continue;

    icon_el.textContent = '';

    try {
      setIcon(icon_el, icon_id);
    } catch (err) {
      continue;
    }

    // If the icon id is unknown, Obsidian may not throw; verify something rendered.
    if (icon_el.querySelector('svg')) return true;
  }

  return false;
}
