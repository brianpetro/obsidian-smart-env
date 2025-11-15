import { CollectionItem } from 'smart-collections';
import { results_acc } from 'smart-utils/results_acc.js';
import { sort_by_score_descending } from 'smart-utils/sort_by_score.js';

export class LookupList extends CollectionItem {
  static key = 'lookup_list';
  static get defaults() {
    return { data: {} };
  }

  async pre_process(params) {
    // default pre_process (via src/actions/lookup-list/pre_process.js)
    // adds params.to_item{vec}
    if (typeof this.actions.lookup_list_pre_process === 'function') {
      await this.actions.lookup_list_pre_process(params);
    }
  }

  async get_results (params = {}) {
    // Pre-process params
    await this.pre_process(params);
    // Main filtering and scoring
    let results = this.filter_and_score(params);
    // Post-process if needed
    if(this.should_post_process) results = await this.post_process(results, params);
    return results;
  }

  filter_and_score (params = {}) {
    const collection = this.env[params.results_collection_key || this.results_collection_key];
    const score_errors = [];
    const { results: raw_results } = Object.values(collection.items)
      .reduce((acc, target) => {
        const scored = target.filter_and_score(params);
        if(!scored?.score){
          if(scored?.error) score_errors.push(scored.error);
          return acc; // skip if errored/filtered out
        }
        results_acc(acc, scored, params.limit || 20); // update acc
        return acc;
      }, { min: 0, results: new Set() })
    ;
    const results = Array.from(raw_results).sort(sort_by_score_descending);
    if(!results.length) return results;
    while(!results.some(r => r.score > 0.5)) {
      results.forEach(r => r.score *= 2);
    }
    return results;
  }

  async post_process (results, params = {}) {
    return results;
  }
  get should_post_process () {
    return this.settings.lookup_post_process
      && this.settings.lookup_post_process !== 'none'
    ;
  }
  get results_collection_key () {
    return this.data.results_collection_key || this.settings?.results_collection_key || 'smart_sources';
  }

  // for compatibility with v3 connections list item
  get item() { return this; }
}

