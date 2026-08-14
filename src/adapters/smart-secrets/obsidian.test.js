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

test.serial('exact-ID secret operations do not write to the console', (t) => {
  const secret_id = 'OpenAI Work #1';
  const secret_value = 'secret-sentinel-value';
  const storage_calls = [];
  const secret_storage = {
    getSecret(received_id) {
      storage_calls.push({ type: 'get', secret_id: received_id });
      return secret_value;
    },
    setSecret(received_id, value) {
      storage_calls.push({ type: 'set', secret_id: received_id, value });
    },
    deleteSecret(received_id) {
      storage_calls.push({ type: 'delete', secret_id: received_id });
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
    t.is(adapter.get_by_id(secret_id), secret_value);
    t.true(adapter.set_by_id(secret_id, secret_value));
    t.true(adapter.delete_by_id(secret_id));
  } finally {
    console_method_names.forEach((method_name) => {
      console[method_name] = original_console_methods[method_name];
    });
  }

  t.deepEqual(
    storage_calls.map((call) => call.type),
    ['get', 'set', 'delete'],
  );
  t.true(storage_calls.every((call) => call.secret_id === secret_id));
  t.is(storage_calls[1].value, secret_value);
  t.deepEqual(console_calls, []);
});

test('exact credential remains accessible after a cold start', async (t) => {
  const secret_id = 'openai-work';
  const secret_value = 'secret-sentinel-value';
  const stored_secrets = new Map();
  const secret_storage = {
    getSecret(received_id) {
      return stored_secrets.get(received_id) ?? null;
    },
    setSecret(received_id, value) {
      stored_secrets.set(received_id, value);
    },
    deleteSecret(received_id) {
      stored_secrets.delete(received_id);
    },
  };

  const write_env = {
    obsidian_app: {
      secretStorage: secret_storage,
    },
  };
  await SmartSecrets.create(write_env, { adapter: ObsidianSecretsAdapter });
  write_env.smart_secrets.set_by_id(secret_id, secret_value);

  const read_env = {
    obsidian_app: {
      secretStorage: secret_storage,
    },
  };
  await SmartSecrets.create(read_env, { adapter: ObsidianSecretsAdapter });

  t.is(read_env.smart_secrets.get_by_id(secret_id), secret_value);
});

test('exact credential IDs bypass all transformation', (t) => {
  const requested_ids = [];
  const credential_id = 'OpenAI Work #1';
  const adapter = new ObsidianSecretsAdapter({
    env: {
      obsidian_app: {
        secretStorage: {
          getSecret(secret_id) {
            requested_ids.push(secret_id);
            return 'secret-value';
          },
        },
      },
    },
  });

  t.is(adapter.get_by_id(credential_id), 'secret-value');
  t.deepEqual(requested_ids, [credential_id]);
});

test('exact-ID operations fail closed without native storage', (t) => {
  const adapter = new ObsidianSecretsAdapter({ env: {} });

  t.is(adapter.get_by_id('openai-work'), null);
  t.false(adapter.set_by_id('openai-work', 'secret-value'));
  t.false(adapter.delete_by_id('openai-work'));
});
