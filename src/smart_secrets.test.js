import test from 'ava';
import { SmartSecrets } from './smart_secrets.js';
import { SecretsAdapter } from './adapters/smart-secrets/_adapter.js';

test('create exposes Core-owned secret accessors on the environment', async (t) => {
  const emitted_events = [];
  const env = {
    events: {
      emit(event_key, payload) {
        emitted_events.push({ event_key, payload });
      },
    },
  };

  const smart_secrets = await SmartSecrets.create(env, {
    adapter: SecretsAdapter,
  });

  t.is(env.smart_secrets, smart_secrets);
  t.is(env.secrets, smart_secrets.secrets);

  env.secrets.embedding_models = {};
  env.secrets.embedding_models.open_router = {};
  env.secrets.embedding_models.open_router.api_key = 'secret-value';

  t.is(
    smart_secrets.get(['embedding_models', 'open_router', 'api_key']),
    'secret-value',
  );
  t.deepEqual(JSON.parse(JSON.stringify(env.secrets)), {});
  t.deepEqual(emitted_events, [
    {
      event_key: 'secrets:changed',
      payload: {
        type: 'set',
        path: ['embedding_models', 'open_router', 'api_key'],
        path_string: 'embedding_models.open_router.api_key',
      },
    },
  ]);
});

test('nested secret deletion removes the adapter value', async (t) => {
  const env = {};
  const smart_secrets = await SmartSecrets.create(env, {
    adapter: SecretsAdapter,
  });

  env.secrets.providers = {};
  env.secrets.providers.openai = {};
  env.secrets.providers.openai.api_key = 'secret-value';
  delete env.secrets.providers.openai.api_key;

  t.is(smart_secrets.get('providers.openai.api_key'), null);
});
