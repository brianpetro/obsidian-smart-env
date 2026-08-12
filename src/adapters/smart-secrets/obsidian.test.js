import test from 'ava';
import { SmartSecrets } from '../../smart_secrets.js';
import { ObsidianSecretsAdapter } from './obsidian.js';

const console_method_names = [
  'debug',
  'error',
  'info',
  'log',
  'warn',
];

test.serial('secret storage operations do not write to the console', (t) => {
  const secret_value = 'secret-sentinel-value';
  const secret_path = [
    'embedding_models',
    `open_router#${Date.UTC(2026, 6, 4, 12, 34, 56)}`,
    'api_key',
  ];
  const expected_secret_id = 'open-router-2026-07-04-12-34-56';
  const storage_calls = [];
  const secret_storage = {
    getSecret(secret_id) {
      storage_calls.push({ type: 'get', secret_id });
      return secret_value;
    },
    setSecret(secret_id, value) {
      storage_calls.push({ type: 'set', secret_id, value });
    },
    deleteSecret(secret_id) {
      storage_calls.push({ type: 'delete', secret_id });
    },
  };
  const adapter = new ObsidianSecretsAdapter({
    env: {
      obsidian_app: {
        secretStorage: secret_storage,
      },
    },
  });
  const original_console_methods = {};
  const console_calls = [];

  console_method_names.forEach((method_name) => {
    original_console_methods[method_name] = console[method_name];
    console[method_name] = (...args) => {
      console_calls.push({ method_name, args });
    };
  });

  try {
    t.is(adapter.get(secret_path), secret_value);
    adapter.set(secret_path, secret_value);
    adapter.delete(secret_path);
  } finally {
    console_method_names.forEach((method_name) => {
      console[method_name] = original_console_methods[method_name];
    });
  }

  t.deepEqual(
    storage_calls.map((call) => call.type),
    ['get', 'set', 'delete'],
  );
  t.is(storage_calls[1].value, secret_value);
  t.true(storage_calls.every((call) => call.secret_id === expected_secret_id));
  t.deepEqual(console_calls, []);
});

test('non-model secret paths use readable IDs', (t) => {
  const adapter = new ObsidianSecretsAdapter({ env: {} });

  t.is(
    adapter.get_secret_id(['plugin_settings', 'Open Router', 'api_key']),
    'plugin-settings-open-router-api-key',
  );
});

test('persisted model API key remains accessible after a cold start', async (t) => {
  const secret_value = 'secret-sentinel-value';
  const model_key = `open_router#${Date.UTC(2026, 6, 4, 12, 34, 56)}`;
  const stored_secrets = new Map();
  const secret_storage = {
    getSecret(secret_id) {
      return stored_secrets.get(secret_id) ?? null;
    },
    setSecret(secret_id, value) {
      stored_secrets.set(secret_id, value);
    },
    deleteSecret(secret_id) {
      stored_secrets.delete(secret_id);
    },
  };

  const write_env = {
    obsidian_app: {
      secretStorage: secret_storage,
    },
  };
  await SmartSecrets.create(write_env, { adapter: ObsidianSecretsAdapter });
  write_env.secrets.embedding_models = {};
  write_env.secrets.embedding_models[model_key] = {};
  write_env.secrets.embedding_models[model_key].api_key = secret_value;

  const read_env = {
    obsidian_app: {
      secretStorage: secret_storage,
    },
  };
  await SmartSecrets.create(read_env, { adapter: ObsidianSecretsAdapter });
  if (!read_env.secrets.embedding_models) read_env.secrets.embedding_models = {};
  const collection_secrets = read_env.secrets.embedding_models;
  if (!collection_secrets[model_key]) collection_secrets[model_key] = {};

  t.is(collection_secrets[model_key].api_key, secret_value);
});
