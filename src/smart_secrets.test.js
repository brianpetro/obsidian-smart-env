import test from 'ava';
import { SmartSecrets } from './smart_secrets.js';
import { SecretsAdapter } from './adapters/smart-secrets/_adapter.js';

test('create exposes only the explicit SmartSecrets service', async (t) => {
  const env = {};
  const smart_secrets = await SmartSecrets.create(env, {
    adapter: SecretsAdapter,
  });

  t.is(env.smart_secrets, smart_secrets);
  t.false(Object.prototype.hasOwnProperty.call(env, 'secrets'));
  t.is(typeof smart_secrets.get, 'undefined');
  t.is(typeof smart_secrets.set, 'undefined');
  t.is(typeof smart_secrets.delete, 'undefined');
  t.is(typeof smart_secrets.secrets, 'undefined');
});

test('exact-ID values can be set, read, and deleted', async (t) => {
  const smart_secrets = await SmartSecrets.create({}, {
    adapter: SecretsAdapter,
  });

  t.true(smart_secrets.set_by_id('openai-work', 'secret-value'));
  t.is(smart_secrets.get_by_id('openai-work'), 'secret-value');
  t.true(smart_secrets.delete_by_id('openai-work'));
  t.is(smart_secrets.get_by_id('openai-work'), null);
});

test('exact credential IDs are delegated unchanged', async (t) => {
  class ExactIdAdapter extends SecretsAdapter {
    get_by_id(secret_id) {
      this.received_secret_id = secret_id;
      return 'secret-value';
    }
  }

  const smart_secrets = await SmartSecrets.create({}, {
    adapter: ExactIdAdapter,
  });

  t.is(smart_secrets.get_by_id('OpenAI Work #1'), 'secret-value');
  t.is(smart_secrets.adapter.received_secret_id, 'OpenAI Work #1');
});
