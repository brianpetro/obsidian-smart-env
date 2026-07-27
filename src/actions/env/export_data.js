import {
  Modal,
  Setting,
} from 'obsidian';

const DEFAULT_EXPORT_CHUNK_SIZE = 1024 * 1024;
const DEFAULT_EXPORT_COLLECTION_KEYS = [
  'smart_sources',
  'smart_blocks',
];
const COLLECTION_LABELS = {
  smart_sources: 'Sources',
  smart_blocks: 'Blocks',
};

/**
 * Open the Smart Environment data export configurator.
 *
 * @this {import('../../../smart_env.js').SmartEnv}
 * @param {object} [params={}]
 * @returns {boolean}
 */
export function env_export_data(params = {}) {
  const app = this.main?.app || this.obsidian_app;
  if (!app || this.export_progress_state?.active) return false;

  const modal = new ExportDataModal(app, this, params);
  modal.open();
  return true;
}

export const menus = {
  'env:status_bar_menu': {
    title: 'Export data',
    icon: 'download',
    order: 30,
    disabled() {
      return Boolean(this.scope?.export_progress_state?.active);
    },
  },
};

class ExportDataModal extends Modal {
  constructor(app, env, params = {}) {
    super(app);
    this.env = env;
    this.params = params;
    this.selected_collections = Object.fromEntries(
      DEFAULT_EXPORT_COLLECTION_KEYS.map((collection_key) => [
        collection_key,
        Boolean(env?.[collection_key]?.items),
      ]),
    );
    this.include_vectors = false;
    this.controls = [];
  }

  onOpen() {
    this.titleEl.setText('Export data');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  render() {
    this.contentEl.empty();
    this.controls = [];

    this.contentEl.createEl('p', {
      text: 'Choose the Smart Environment collections to include in one JSON export file.',
    });

    DEFAULT_EXPORT_COLLECTION_KEYS.forEach((collection_key) => {
      this.render_collection_setting(collection_key);
    });

    new Setting(this.contentEl)
      .setName('Include embedding vectors')
      .setDesc('Adds the current embedding vector as vec on each exported item. This can make exports much larger.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.include_vectors)
          .onChange((value) => {
            this.include_vectors = value;
          })
        ;
        this.controls.push(toggle);
      })
    ;

    this.status_el = this.contentEl.createDiv({
      cls: 'setting-item-description',
      text: 'The JSON file will be saved in the vault root.',
    });

    this.progress_el = this.contentEl.createEl('progress');
    this.progress_el.max = 100;
    this.progress_el.hidden = true;
    this.progress_el.setAttribute(
      'aria-label',
      'Smart Environment export progress',
    );
    this.progress_el.style.width = '100%';
    this.progress_el.style.height = '0.75rem';
    this.progress_el.style.marginTop = 'var(--size-4-2)';
    this.progress_el.style.marginBottom = 'var(--size-4-2)';

    new Setting(this.contentEl)
      .addButton((button) => {
        this.export_button = button;
        button
          .setButtonText('Export')
          .setCta()
          .onClick(async () => {
            await this.run_export();
          })
        ;
      })
    ;
  }

  render_collection_setting(collection_key) {
    const collection = this.env?.[collection_key];
    const available = Boolean(collection?.items);
    const item_count = Object.keys(collection?.items || {}).length;
    const label = COLLECTION_LABELS[collection_key] || collection_key;
    const description = available
      ? `${item_count} ${item_count === 1 ? 'item' : 'items'}`
      : 'Collection unavailable'
    ;

    new Setting(this.contentEl)
      .setName(label)
      .setDesc(description)
      .addToggle((toggle) => {
        toggle
          .setValue(Boolean(this.selected_collections[collection_key]))
          .setDisabled(!available)
          .onChange((value) => {
            this.selected_collections[collection_key] = value;
          })
        ;
        if (available) this.controls.push(toggle);
      })
    ;
  }

  async run_export() {
    const collection_keys = DEFAULT_EXPORT_COLLECTION_KEYS
      .filter((collection_key) => this.selected_collections[collection_key])
    ;
    if (!collection_keys.length) {
      this.hide_progress();
      this.set_status('Select at least one collection to export.');
      return false;
    }
    if (this.env?.export_progress_state?.active) {
      this.hide_progress();
      this.set_status('A Smart Environment data export is already in progress.');
      return false;
    }

    this.set_running(true);
    this.set_status('Preparing export...');
    this.set_progress(null);

    try {
      const result = await run_env_export(this.env, {
        collection_keys,
        include_vectors: this.include_vectors,
        event_source: this.params.event_source || 'env_export_data',
        on_progress: (progress) => {
          this.render_progress(progress);
        },
      });
      const item_label = result.item_count === 1 ? 'item' : 'items';
      this.set_progress(100);
      this.set_status(
        `Exported ${result.item_count} ${item_label} to ${result.file_path}.`,
      );
      this.export_button?.setButtonText('Export again');
      return result;
    } catch (error) {
      console.error('Smart Environment data export failed', error);
      this.hide_progress();
      this.set_status(`Export failed: ${error?.message || error}`);
      this.export_button?.setButtonText('Retry export');
      return false;
    } finally {
      this.set_running(false);
    }
  }

  render_progress(progress = {}) {
    if (progress.active === false) return;

    const collection_label = COLLECTION_LABELS[progress.collection_key]
      || progress.collection_key
      || 'data'
    ;
    const current = Number(progress.progress || 0);
    const total = Number(progress.total || 0);
    const progress_pct = total > 0
      ? (current / total) * 100
      : null
    ;

    this.set_status(`Exporting ${collection_label}...`);
    this.set_progress(progress_pct);
  }

  set_progress(progress_pct) {
    if (!this.progress_el) return;

    this.progress_el.hidden = false;
    if (!Number.isFinite(progress_pct)) {
      this.progress_el.removeAttribute('value');
      this.progress_el.removeAttribute('aria-valuenow');
      return;
    }

    const value = Math.max(0, Math.min(100, progress_pct));
    this.progress_el.value = value;
    this.progress_el.setAttribute('aria-valuenow', String(value));
  }

  hide_progress() {
    if (!this.progress_el) return;

    this.progress_el.hidden = true;
    this.progress_el.removeAttribute('value');
    this.progress_el.removeAttribute('aria-valuenow');
  }

  set_running(running) {
    this.controls.forEach((control) => {
      control.setDisabled?.(running);
    });
    this.export_button?.setDisabled(running);
    if (running) this.export_button?.setButtonText('Exporting...');
  }

  set_status(message) {
    if (!this.status_el) return;
    if (typeof this.status_el.setText === 'function') {
      this.status_el.setText(message);
      return;
    }
    this.status_el.textContent = message;
  }
}

async function run_env_export(env, params = {}) {
  if (env.export_progress_state?.active) {
    throw new Error('Smart Environment data export is already in progress.');
  }

  const {
    collection_keys,
    event_source = 'env_export_data',
    include_vectors = false,
    on_progress,
  } = params;
  let progress_started = false;
  let last_progress = null;

  const update_progress = (progress = {}) => {
    last_progress = {
      ...progress,
      active: true,
    };
    env.export_progress_state = last_progress;
    call_progress_handler(on_progress, last_progress);

    if (progress_started) return;
    progress_started = true;
    env.events?.emit?.('smart_env:export_progress', {
      ...last_progress,
      event_source,
    });
  };

  try {
    const result = await export_env_data(env, {
      collection_keys,
      include_vectors,
      on_progress: update_progress,
    });

    env.events?.emit?.('smart_env:exported', {
      level: 'attention',
      message: `Exported ${result.item_count} Smart Environment items to ${result.file_path}.`,
      file_path: result.file_path,
      event_source,
    });
    return result;
  } catch (error) {
    env.events?.emit?.('smart_env:export_failed', {
      level: 'error',
      message: 'Smart Environment data export failed.',
      details: error?.stack || error?.message || String(error),
      event_source,
    });
    throw error;
  } finally {
    env.export_progress_state = null;
    const completed_progress = {
      ...(last_progress || {}),
      active: false,
    };
    call_progress_handler(on_progress, completed_progress);
    env.events?.emit?.('smart_env:export_progress', {
      ...completed_progress,
      event_source,
    });
  }
}

async function export_env_data(env, params = {}) {
  const collection_keys = get_export_collection_keys(
    env,
    params.collection_keys,
  );
  if (!collection_keys.length) {
    throw new Error('No exportable Smart Environment collections selected.');
  }

  const fs = env?.fs;
  assert_export_fs(fs);

  const file_path = build_export_file_path();
  const total = collection_keys.reduce((sum, collection_key) => {
    return sum + get_collection_item_count(env?.[collection_key]);
  }, 0);
  const json_replacer = params.include_vectors
    ? undefined
    : function export_json_replacer(key, value) {
      return key === 'vec' ? undefined : value;
    }
  ;

  let buffer = '{';
  let chunk_count = 0;
  let write_started = false;
  let has_written = false;
  let progress = 0;
  let current_collection_key = collection_keys[0];
  let current_collection_i = 0;
  let current_collection_progress = 0;
  let current_collection_total = get_collection_item_count(
    env?.[current_collection_key],
  );

  const report_progress = () => {
    call_progress_handler(params.on_progress, {
      active: true,
      collection_key: current_collection_key,
      collection_i: current_collection_i,
      collection_count: collection_keys.length,
      collection_progress: current_collection_progress,
      collection_total: current_collection_total,
      progress,
      total,
      file_path,
    });
  };

  const flush_buffer = async (force = false) => {
    if (!buffer) return false;
    if (!force && buffer.length < DEFAULT_EXPORT_CHUNK_SIZE) return false;

    if (has_written) {
      await append_export_file(fs, file_path, buffer);
    } else {
      write_started = true;
      await write_export_file(fs, file_path, buffer);
      has_written = true;
    }

    buffer = '';
    chunk_count += 1;
    report_progress();
    return true;
  };

  try {
    for (let collection_i = 0; collection_i < collection_keys.length; collection_i += 1) {
      const collection_key = collection_keys[collection_i];
      const collection = env[collection_key];
      const item_keys = Object.keys(collection?.items || {});

      current_collection_key = collection_key;
      current_collection_i = collection_i;
      current_collection_progress = 0;
      current_collection_total = item_keys.length;
      report_progress();

      if (params.include_vectors) {
        await collection?.embeddings?.load_vectors?.();
      }

      const collection_chunk = `${collection_i === 0 ? '\n' : ',\n'}  ${JSON.stringify(collection_key)}: {\n    "items": [`;
      if (buffer.length + collection_chunk.length > DEFAULT_EXPORT_CHUNK_SIZE) {
        await flush_buffer(true);
      }
      buffer += collection_chunk;

      for (let item_i = 0; item_i < item_keys.length; item_i += 1) {
        const item_key = item_keys[item_i];
        const item = collection.items[item_key];
        const mapped_data = map_export_item(
          item,
          params.include_vectors,
        );
        let item_json;

        try {
          item_json = JSON.stringify(mapped_data, json_replacer);
        } catch (error) {
          throw new Error(
            `Unable to serialize ${collection_key} item ${item_key}: ${error?.message || error}`,
          );
        }
        if (typeof item_json === 'undefined') item_json = 'null';

        const item_chunk = `${item_i === 0 ? '\n      ' : ',\n      '}${item_json}`;
        if (buffer.length + item_chunk.length > DEFAULT_EXPORT_CHUNK_SIZE) {
          await flush_buffer(true);
        }
        buffer += item_chunk;
        current_collection_progress = item_i + 1;
        progress += 1;
        await flush_buffer();
      }

      const collection_end = item_keys.length
        ? '\n    ]\n  }'
        : ']\n  }'
      ;
      if (buffer.length + collection_end.length > DEFAULT_EXPORT_CHUNK_SIZE) {
        await flush_buffer(true);
      }
      buffer += collection_end;
      report_progress();
    }

    buffer += '\n}\n';
    await flush_buffer(true);
  } catch (error) {
    if (write_started) await remove_export_file(fs, file_path);
    throw error;
  }

  report_progress();

  return {
    file_path,
    item_count: total,
    collection_count: collection_keys.length,
    chunk_count,
  };
}

function map_export_item(item, include_vectors) {
  const data = item?.data;
  if (!include_vectors) return data;

  const vec = item?.vec;
  if (!vec?.length) return data;

  return {
    ...data,
    vec: Array.from(vec),
  };
}

function get_export_collection_keys(env, collection_keys) {
  const requested_keys = Array.isArray(collection_keys)
    ? collection_keys
    : DEFAULT_EXPORT_COLLECTION_KEYS
  ;

  return Array.from(new Set(requested_keys))
    .filter((collection_key) => {
      return typeof collection_key === 'string'
        && collection_key.length > 0
        && env?.[collection_key]?.items
      ;
    })
  ;
}

function build_export_file_path(date = new Date()) {
  const timestamp = date.toISOString()
    .replace(/[:.]/g, '-')
  ;
  return `smart-env-export-${timestamp}.json`;
}

function get_collection_item_count(collection) {
  return Object.keys(collection?.items || {}).length;
}

function assert_export_fs(fs) {
  const has_write = typeof fs?.write === 'function'
    || typeof fs?.adapter?.write === 'function'
  ;
  const has_append = typeof fs?.append === 'function'
    || typeof fs?.adapter?.append === 'function'
  ;
  if (!has_write || !has_append) {
    throw new TypeError('Smart Environment export requires write and append filesystem methods.');
  }
}

async function write_export_file(fs, file_path, content) {
  // User-requested output must not be blocked by source-import exclusions.
  if (typeof fs?.adapter?.write === 'function') {
    return await fs.adapter.write(file_path, content);
  }
  return await fs.write(file_path, content);
}

async function append_export_file(fs, file_path, content) {
  // SmartFs.append applies source-import exclusions, so prefer the raw adapter.
  if (typeof fs?.adapter?.append === 'function') {
    return await fs.adapter.append(file_path, content);
  }
  return await fs.append(file_path, content);
}

async function remove_export_file(fs, file_path) {
  try {
    if (typeof fs?.adapter?.remove === 'function') {
      await fs.adapter.remove(file_path);
      return;
    }
    if (typeof fs?.remove === 'function') {
      await fs.remove(file_path);
    }
  } catch (error) {
    console.warn(`Failed to remove incomplete export file: ${file_path}`, error);
  }
}

function call_progress_handler(on_progress, progress) {
  if (typeof on_progress !== 'function') return;

  try {
    on_progress(progress);
  } catch (error) {
    console.warn('Smart Environment export progress handler failed', error);
  }
}
