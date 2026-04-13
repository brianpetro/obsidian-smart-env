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
    // log performance of filter_and_score
    if (this.env.log_perf) this.start_ms = Date.now();
    let results = this.filter_and_score(params);
    if (this.env.log_perf) {
      this.end_ms = Date.now();
      console.log(`filter_and_score(${params.score_algo_key}) took ${this.end_ms - this.start_ms} ms (Date.now)`);
    }
    // Post-process if needed
    if(this.should_post_process) results = await this.post_process(results, params);
    this.emit_event('lookup:get_results');
    return results;
  }

  filter_and_score (params = {}) {
    const collection = this.env[params.results_collection_key] || this.env[this.collection.results_collection_key];
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

  // for compatibility with v3 connections list item
  get item() { return this; }
}

