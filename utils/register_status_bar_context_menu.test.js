import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import test from 'ava';

let register_status_bar_context_menu;

async function load_helper() {
  const tmp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'status-bar-menu-'));
  const src_url = new URL('./register_status_bar_context_menu.js', import.meta.url);
  const original_src = await fs.readFile(src_url, 'utf8');
  const patched_src = original_src
    .replace('import { Menu, Notice } from "obsidian";', 'import { Menu, Notice } from "./obsidian_stub.js";')
    .replace('../views/source_inspector.js', './source_inspector_stub.js')
    .replace('../modals/env_stats.js', './env_stats_stub.js');
  await fs.writeFile(path.join(tmp_dir, 'register_status_bar_context_menu.js'), patched_src, 'utf8');
  const obsidian_stub = `export class Menu { constructor() {} addItem() {} addSeparator() {} showAtPosition() {} }
export class Notice { constructor(message) { this.message = message; } }
`;
  await fs.writeFile(path.join(tmp_dir, 'obsidian_stub.js'), obsidian_stub, 'utf8');
  const inspector_stub = `export class SmartNoteInspectModal { constructor() {} open() {} }
`;
  await fs.writeFile(path.join(tmp_dir, 'source_inspector_stub.js'), inspector_stub, 'utf8');
  const stats_stub = `export class EnvStatsModal { constructor() {} open() {} }
`;
  await fs.writeFile(path.join(tmp_dir, 'env_stats_stub.js'), stats_stub, 'utf8');
  const mod_url = pathToFileURL(path.join(tmp_dir, 'register_status_bar_context_menu.js')).href;
  const mod = await import(mod_url);
  return mod.register_status_bar_context_menu;
}

test.before(async () => {
  register_status_bar_context_menu = await load_helper();
});

class StubItem {
  constructor() {
    this.title = '';
    this.icon = '';
    this.click = () => {};
  }
  setTitle(title) { this.title = title; return this; }
  setIcon(icon) { this.icon = icon; return this; }
  onClick(fn) { this.click = fn; return this; }
}

class StubMenu {
  constructor(app) { this.items = []; app.last_menu = this; }
  addItem(fn) { const item = new StubItem(); fn(item); this.items.push(item); }
  addSeparator() { this.items.push('sep'); }
  showAtPosition() {}
}

test('adds Export data menu item that triggers env.export_json', t => {
  let handler;
  const env = {
    main: {
      app: {},
      registerDomEvent: (_el, _ev, cb) => { handler = cb; },
    },
    export_json_called: false,
    export_json() { this.export_json_called = true; },
  };
  const status_container = {};
  register_status_bar_context_menu(env, status_container, { Menu: StubMenu });
  handler({ preventDefault() {}, stopPropagation() {}, pageX: 0, pageY: 0 });
  const export_item = env.main.app.last_menu.items.find(i => i.title === 'Export data');
  export_item.click();
  t.true(env.export_json_called);
});
