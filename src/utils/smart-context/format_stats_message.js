/**
 * Build user-facing copy notice message.
 *
 * @param {object} stats
 * @param {number} stats.item_count
 * @param {number} stats.char_count
 * @param {number} [stats.max_depth]
 * @param {Record<string, number>} [stats.exclusions]
 * @returns {string}
 */
export function format_stats_message(stats = {}) {
  const item_count = Number.isFinite(stats.item_count) ? stats.item_count : 0;
  const char_count = Number.isFinite(stats.char_count) ? stats.char_count : 0;
  const segments = [];

  segments.push(`${item_count} file(s)`);
  segments.push(`${format_char_count(char_count)} chars`);

  if (Number.isFinite(stats.max_depth)) {
    segments.push(`depth≤${stats.max_depth}`);
  }

  const excluded_total = sum_exclusions(stats.exclusions);
  if (excluded_total > 0) {
    segments.push(`${excluded_total} section(s) excluded`);
  }

  return `Copied to clipboard! (${segments.join(', ')})`;
}

/**
 * Format character count into human readable string.
 * @param {number} char_count
 * @returns {string}
 */
function format_char_count(char_count) {
  if (!Number.isFinite(char_count)) return '0';
  if (char_count >= 100000) {
    return `~${Math.round(char_count / 1000)}k`;
  }
  return char_count.toLocaleString();
}

/**
 * Sum exclusion counts if provided.
 * @param {Record<string, number>|undefined} exclusions
 * @returns {number}
 */
function sum_exclusions(exclusions) {
  if (!exclusions) return 0;
  return Object.values(exclusions).reduce((total, value) => {
    const numeric = Number.isFinite(value) ? value : 0;
    return total + numeric;
  }, 0);
}
