import { context_suggest_blocks } from "./blocks.js";
export function context_suggest_sources(params={}) {
  const unselected = Object.values(this.env.smart_sources.items)
    .map(src => ({
      key: src.key,
      display: src.key,
      mod_select_action: () => {
        return context_suggest_blocks.call(this, { source_key: src.key });
      }
    }))
  ;
  return unselected;
}
export const display_name = 'Add sources';