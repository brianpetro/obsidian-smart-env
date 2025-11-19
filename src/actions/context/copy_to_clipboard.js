import { Notice } from 'obsidian';
import { copy_to_clipboard as base_copy } from 'obsidian-smart-env/utils/copy_to_clipboard.js';

export async function copy_to_clipboard(params = {}) {
  // TODO: replace with get_text (needs new stats support)
  // const { context, stats, images } = await this.compile({ link_depth: 0 });
  // await base_copy(context, images); // may replace with env.actions.copy_to_clipboard
  // show_stats_notice(this, stats);
  const content = await this.get_text();
  show_stats_notice(this, {
    char_count: content.length,
  });
  await base_copy(content);
}

/**
 * Show user-facing notice summarizing stats.
 */
function show_stats_notice(ctx, stats) {
  const ctx_ct = `${Object.keys(ctx.data.context_items).length} file(s)`;
  let msg = `Copied to clipboard! (${ctx_ct})`;
  if (stats) {
    const char_count = stats.char_count < 100000
      ? stats.char_count
      : `~${Math.round(stats.char_count / 1000)}k`
    ;
    msg += `, ${char_count} chars`;

    if (stats.exclusions) {
      const total_excluded = Object.values(stats.exclusions).reduce(
        (p, c) => p + c,
        0
      );
      if (total_excluded > 0) {
        msg += `, ${total_excluded} section(s) excluded`;
      }
    }
  }
  new Notice(msg);
}