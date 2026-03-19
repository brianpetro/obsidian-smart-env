import { copy_to_clipboard as base_copy } from '../../../utils/copy_to_clipboard.js';
import { format_stats_message } from '../../utils/smart-context/format_stats_message.js';

export async function copy_to_clipboard(params = {}) {
  const context_items = this.context_items.filter(params.filter);
  if (!context_items.length) {
    this.emit_event('context:copy_empty', {
      level: 'warning',
      message: 'No context items to copy.',
      event_source: 'context_actions.copy_to_clipboard',
    });
    return false;
  }
  const content = await this.get_text(params);
  const copied = await base_copy(content, {
    env: this.env,
    event_source: 'context_actions.copy_to_clipboard.base_copy',
    success_event_key: 'context:clipboard_raw_copied',
    error_event_key: 'context:clipboard_raw_copy_failed',
    unavailable_event_key: 'context:clipboard_copy_unavailable',
  });
  if (!copied) return false;

  const message = format_stats_message({
    item_count: context_items.length,
    char_count: content.length,
    max_depth: params.max_depth,
    exclusions: params.exclusions,
  });
  this.emit_event('context:copied', {
    level: 'info',
    message,
    event_source: 'context_actions.copy_to_clipboard',
  });
  return true;
}