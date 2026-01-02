import test from 'ava';
import { create_reset_confirm_ui } from './reset_confirm.js';

class StubElement {
  constructor(tag = 'div', attrs = {}, parent = null) {
    this.tag = tag;
    this.cls = attrs.cls || '';
    this.textContent = attrs.text || '';
    this.parent = parent;
    this.children = [];
    this.style = { display: 'inline-block' };
    this.handlers = {};
  }

  createEl(tag, attrs = {}) {
    const child = new StubElement(tag, attrs, this);
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    return find_match(this, selector);
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(child => child !== this);
  }

  addEventListener(event, handler) {
    this.handlers[event] = handler;
  }

  async trigger(event) {
    const handler = this.handlers[event];
    if (!handler) return;
    await handler({ target: this });
  }

  closest(selector) {
    if (matches(this, selector)) return this;
    return this.parent?.closest(selector) || null;
  }
}

function matches(el, selector) {
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return (el.cls || '').split(/\s+/).includes(cls);
  }
  if (selector === 'button') return el.tag === 'button';
  return false;
}

function find_match(el, selector) {
  for (const child of el.children) {
    if (matches(child, selector)) return child;
    const nested = find_match(child, selector);
    if (nested) return nested;
  }
  return null;
}

function create_control() {
  const container = new StubElement('div');
  const reset_btn = container.createEl('button', { text: 'Reset settings' });
  return { container, reset_btn };
}

function create_confirm_row(parent) {
  const row = parent.createEl('div', { cls: 'sc-inline-confirm-row' });
  const message_el = row.createEl('span', { text: 'Reset Smart Environment settings to defaults?' });
  const cancel_btn = row.createEl('button', { text: 'Cancel' });
  const confirm_btn = row.createEl('button', { text: 'Reset', cls: 'mod-warning' });
  return { row, message_el, cancel_btn, confirm_btn };
}

test('shows confirmation and resets settings before closing', async t => {
  const { container, reset_btn } = create_control();
  const reset_calls = [];
  const env = { name: 'env' };

  const ui = create_reset_confirm_ui(env, {
    container,
    reset_env_settings_fn: async (subject) => {
      reset_calls.push(subject);
      return { settings: true };
    },
    create_row: create_confirm_row,
    display_values: { hidden: 'none', shown: 'block' },
  });

  t.is(reset_btn.style.display, 'none');

  await ui.confirm_btn.trigger('click');

  t.deepEqual(reset_calls, [env]);
  t.is(ui.message_el.textContent, 'Settings reset. Reopen this tab to review defaults.');
  t.is(ui.confirm_btn.style.display, 'none');
  t.is(ui.cancel_btn.textContent, 'Close');

  await ui.cancel_btn.trigger('click');

  t.is(reset_btn.style.display, 'block');
  t.false(container.children.includes(ui.row));
});

test('replaces existing confirmation row', t => {
  const { container } = create_control();
  const stale_row = create_confirm_row(container).row;
  let created_rows = 0;

  const ui = create_reset_confirm_ui({}, {
    container,
    create_row: (...args) => {
      created_rows += 1;
      return create_confirm_row(...args);
    },
    display_values: { hidden: 'none', shown: 'inline' },
  });

  const confirm_rows = container.children.filter(child => matches(child, '.sc-inline-confirm-row'));

  t.is(created_rows, 1);
  t.false(container.children.includes(stale_row));
  t.is(confirm_rows.length, 1);
  t.is(ui.row, confirm_rows[0]);
});
