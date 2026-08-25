import { Collection } from 'smart-collections';
import { LookupList } from '../items/lookup_list.js';
import { murmur_hash_32_alphanumeric } from 'smart-utils/create_hash.js';

export const settings_config = {
  get_results_action_key: {
    name: "Lookup retrieval strategy",
    type: "dropdown",
    description: "Choose the action used to retrieve and rank Lookup results.",
    options_callback: (scope) => {
      return Object.entries(scope.env.config.actions)
        .filter(([action_key]) => {
          return action_key === 'lookup_list_get_results'
            || action_key.startsWith('lookup_list_get_results_')
          ;
        })
        .map(([value, action]) => ({
          value,
          name: action.display_name || value,
        }))
      ;
    }
  },
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
      get_results_action_key: 'lookup_list_get_results',
      results_collection_key: 'smart_blocks',
      score_algo_key: 'similarity',
      results_limit: 20,
    };
  }
  static version = 0.01;

  new_lookup_list({query, filter}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('LookupLists.new_item requires a non-empty query string.');
    }

    const date = format_ymd(new Date());
    const hash = murmur_hash_32_alphanumeric(query);
    const key = `${date}+${hash}`;

    return new this.item_type(this.env, {
      key,
      query,
      filter,
    });
  }

  new_item(params) {
    const list = this.new_lookup_list(params);

    // Reuse if exists
    if (this.items[list.key]) return this.items[list.key];

    // Register
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

