import test from 'ava';
import { format_stats_message } from './format_stats_message.js';

test('format_stats_message builds base copy notice', t => {
  const message = format_stats_message({ item_count: 2, char_count: 120 });
  t.is(message, 'Copied to clipboard! (2 file(s), 120 chars)');
});

test('format_stats_message includes depth when provided', t => {
  const message = format_stats_message({
    item_count: 1,
    char_count: 456,
    max_depth: 3,
  });
  t.is(message, 'Copied to clipboard! (1 file(s), 456 chars, depth≤3)');
});

test('format_stats_message includes exclusions and rounds large counts', t => {
  const message = format_stats_message({
    item_count: 4,
    char_count: 120000,
    max_depth: 2,
    exclusions: { headings: 2, blocks: 1 },
  });
  t.is(message, 'Copied to clipboard! (4 file(s), ~120k chars, depth≤2, 3 section(s) excluded)');
});
