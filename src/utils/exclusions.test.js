import test from 'ava';
import {
  add_exclusion,
  ensure_smart_sources_settings,
  parse_exclusions_csv,
  remove_exclusion,
} from './exclusions.js';

test('parse_exclusions_csv trims and filters entries', t => {
  t.deepEqual(parse_exclusions_csv(' a , ,b, c '), ['a', 'b', 'c']);
  t.deepEqual(parse_exclusions_csv(''), []);
});

test('add_exclusion adds unique trimmed values', t => {
  t.is(add_exclusion('alpha,beta', ' gamma '), 'alpha,beta,gamma');
  t.is(add_exclusion('alpha,beta', 'beta'), 'alpha,beta');
  t.is(add_exclusion('', '  '), '');
});

test('remove_exclusion removes only matching entries', t => {
  t.is(remove_exclusion('alpha,beta,gamma', ' beta '), 'alpha,gamma');
  t.is(remove_exclusion('single', 'missing'), 'single');
  t.is(remove_exclusion('', 'beta'), '');
});

test('ensure_smart_sources_settings creates defaults', t => {
  const env = { settings: {} };
  const smart_sources_settings = ensure_smart_sources_settings(env);
  t.truthy(env.settings.smart_sources);
  t.is(smart_sources_settings.folder_exclusions, '');
  t.is(smart_sources_settings.file_exclusions, '');
});

test('ensure_smart_sources_settings preserves existing values', t => {
  const env = { settings: { smart_sources: { folder_exclusions: 'x', file_exclusions: 'y' } } };
  const smart_sources_settings = ensure_smart_sources_settings(env);
  t.is(smart_sources_settings.folder_exclusions, 'x');
  t.is(smart_sources_settings.file_exclusions, 'y');
});
