import test from 'ava';
import { build_reset_settings, reset_env_settings } from './reset_env_settings.js';

const create_env_stub = (overrides = {}) => ({
  config: { default_settings: { smart_sources: { file_exclusions: 'skip.md' }, language: 'en' } },
  fs: { auto_excluded_files: ['auto.md'] },
  smart_settings: {
    settings: {},
    saved_with: null,
    async save(settings) {
      this.saved_with = settings;
      return settings;
    },
  },
  events: {
    emitted: [],
    emit(name, payload) {
      this.emitted.push({ name, payload });
    },
  },
  ...overrides,
});

test('build_reset_settings clones defaults and keeps originals untouched', t => {
  const env = create_env_stub();
  const defaults_snapshot = JSON.parse(JSON.stringify(env.config.default_settings));
  const reset_settings = build_reset_settings(env);

  t.deepEqual(env.config.default_settings, defaults_snapshot);
  reset_settings.language = 'fr';
  t.not(env.config.default_settings.language, reset_settings.language);
  t.is(reset_settings.smart_sources.file_exclusions, 'skip.md,auto.md');
});

test('build_reset_settings deduplicates auto exclusions and preserves order', t => {
  const env = create_env_stub({
    config: { default_settings: { smart_sources: { file_exclusions: 'skip.md,auto.md' } } },
    fs: { auto_excluded_files: ['auto.md', 'new.md'] },
  });
  const reset_settings = build_reset_settings(env);
  t.is(reset_settings.smart_sources.file_exclusions, 'skip.md,auto.md,new.md');
});

test('reset_env_settings saves defaults and emits event', async t => {
  const env = create_env_stub();
  const reset_settings = await reset_env_settings(env);

  t.deepEqual(env.smart_settings.saved_with, reset_settings);
  t.is(env.smart_settings.saved_with.smart_sources.file_exclusions, 'skip.md,auto.md');
  t.deepEqual(env.events.emitted, [{ name: 'settings:reset', payload: { settings: reset_settings } }]);
});
