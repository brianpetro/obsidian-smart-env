import { Collection } from 'smart-collections';
import { LookupList } from '../items/lookup_list.js';
import { murmur_hash_32_alphanumeric } from 'smart-utils/create_hash.js';
import { create_settings_section_heading } from '../utils/create_settings_section_heading.js';

export const settings_config = {
  results_collection_key: {
    name: "Lookup results type",
    type: "dropdown",
    description: "Choose whether results should be sources or blocks.",
    option_1: 'smart_sources|Sources',
    option_2: 'smart_blocks|Blocks',
    options_callback: (scope) => {
      const options = [
        { value: 'smart_sources', name: 'Sources' },
      ];
      if (scope.env.smart_blocks) {
        options.push({ value: 'smart_blocks', name: 'Blocks' });
      }
      return options;
    }
  },
}

export class LookupLists extends Collection {
  static get default_settings() {
    return {
      results_collection_key: 'smart_blocks',
      score_algo_key: 'similarity',
      results_limit: 20,
    };
  }
  static version = 0.01;

  new_item({query, filter}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('LookupLists.new_item requires a non-empty query string.');
    }

    const date = format_ymd(new Date());
    const hash = murmur_hash_32_alphanumeric(query);
    const key = `${date}+${hash}`;

    // Reuse if exists
    if (this.items[key]) return this.items[key];

    // Create
    const list = new LookupList(this.env, {
      key,
      query,
      filter,
    });
    this.set(list);

    return list;
  }

  get settings_config() {
    return { ...settings_config };
  }

  process_load_queue() { /* skip save/load for now */ }

  get results_collection_key () {
    const stored_key = this.settings?.results_collection_key;
    if(this.env.collections?.[stored_key]) return stored_key;
    return 'smart_sources'; // default
  }
}

/** @param {Date} d */
function format_ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default {
  class: LookupLists,
  collection_key: 'lookup_lists',
  item_type: LookupList,
  settings_config,
};

