import test from 'ava';
import {
  clear_smart_plugins_tokens,
  get_smart_plugins_token,
  migrate_legacy_oauth_tokens,
} from './sc_oauth.js';

function create_local_storage(initial = {}) {
  const data = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

function create_smart_secrets(initial = {}, params = {}) {
  const data = new Map(Object.entries(initial));
  const read_ids = [];
  const write_ids = [];
  const delete_ids = [];

  return {
    data,
    read_ids,
    write_ids,
    delete_ids,
    get_by_id(secret_id) {
      read_ids.push(secret_id);
      if (params.readback_fails) return null;
      return data.has(secret_id) ? data.get(secret_id) : null;
    },
    set_by_id(secret_id, value) {
      write_ids.push(secret_id);
      if (params.write_fails) return false;
      data.set(secret_id, String(value));
      return true;
    },
    delete_by_id(secret_id) {
      delete_ids.push(secret_id);
      data.delete(secret_id);
      return true;
    },
  };
}

function create_env(smart_secrets, vault_name = 'OAuth Test Vault') {
  return {
    obsidian_app: {
      vault: {
        getName() {
          return vault_name;
        },
      },
    },
    smart_secrets,
  };
}

const ACCESS_ID = 'smart-plugins-oauth-access';
const REFRESH_ID = 'smart-plugins-oauth-refresh';
const TEMPORARY_ACCESS_ID =
  'smart-plugins-oauth-oauth-test-vault-1xs83jg-access';
const TEMPORARY_REFRESH_ID =
  'smart-plugins-oauth-oauth-test-vault-1xs83jg-refresh';
const LEGACY_ACCESS_ID = 'oauth_test_vault_smart_plugins_oauth_token';
const LEGACY_REFRESH_ID = 'oauth_test_vault_smart_plugins_oauth_refresh';

test.beforeEach((t) => {
  const original_local_storage = globalThis.localStorage;
  t.teardown(() => {
    globalThis.localStorage = original_local_storage;
  });
});

test.serial('get_smart_plugins_token uses the fixed readable credential ID', (t) => {
  const smart_secrets = create_smart_secrets({
    [ACCESS_ID]: 'secure-access',
  });

  t.is(
    get_smart_plugins_token(create_env(smart_secrets, 'First Vault')),
    'secure-access',
  );
  t.is(
    get_smart_plugins_token(create_env(smart_secrets, 'Renamed Vault')),
    'secure-access',
  );
  t.deepEqual(smart_secrets.read_ids, [ACCESS_ID, ACCESS_ID]);
});

test.serial('temporary SecretStorage IDs migrate to fixed IDs', (t) => {
  globalThis.localStorage = create_local_storage();
  const smart_secrets = create_smart_secrets({
    [TEMPORARY_ACCESS_ID]: 'temporary-access',
    [TEMPORARY_REFRESH_ID]: 'temporary-refresh',
  });
  const env = create_env(smart_secrets);

  migrate_legacy_oauth_tokens(env);

  t.is(smart_secrets.data.get(ACCESS_ID), 'temporary-access');
  t.is(smart_secrets.data.get(REFRESH_ID), 'temporary-refresh');
  t.false(smart_secrets.data.has(TEMPORARY_ACCESS_ID));
  t.false(smart_secrets.data.has(TEMPORARY_REFRESH_ID));
});

test.serial('legacy localStorage tokens migrate to fixed IDs', (t) => {
  globalThis.localStorage = create_local_storage({
    [LEGACY_ACCESS_ID]: 'legacy-access',
    [LEGACY_REFRESH_ID]: 'legacy-refresh',
  });
  const smart_secrets = create_smart_secrets();
  const env = create_env(smart_secrets);

  migrate_legacy_oauth_tokens(env);

  t.is(smart_secrets.data.get(ACCESS_ID), 'legacy-access');
  t.is(smart_secrets.data.get(REFRESH_ID), 'legacy-refresh');
  t.is(localStorage.getItem(LEGACY_ACCESS_ID), null);
  t.is(localStorage.getItem(LEGACY_REFRESH_ID), null);
});

test.serial('fixed credentials take precedence over conflicting temporary IDs', (t) => {
  globalThis.localStorage = create_local_storage();
  const smart_secrets = create_smart_secrets({
    [ACCESS_ID]: 'fixed-access',
    [TEMPORARY_ACCESS_ID]: 'temporary-access',
  });
  const env = create_env(smart_secrets);
  const warnings = [];
  const original_warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  t.teardown(() => {
    console.warn = original_warn;
  });

  migrate_legacy_oauth_tokens(env);

  t.is(smart_secrets.data.get(ACCESS_ID), 'fixed-access');
  t.is(smart_secrets.data.get(TEMPORARY_ACCESS_ID), 'temporary-access');
  t.false(warnings.join(' ').includes('fixed-access'));
  t.false(warnings.join(' ').includes('temporary-access'));
});

test.serial('failed temporary-ID migration preserves every source value', (t) => {
  globalThis.localStorage = create_local_storage({
    [LEGACY_ACCESS_ID]: 'legacy-access',
  });
  const smart_secrets = create_smart_secrets({
    [TEMPORARY_ACCESS_ID]: 'temporary-access',
  }, {
    write_fails: true,
  });
  const env = create_env(smart_secrets);

  migrate_legacy_oauth_tokens(env);

  t.false(smart_secrets.data.has(ACCESS_ID));
  t.is(smart_secrets.data.get(TEMPORARY_ACCESS_ID), 'temporary-access');
  t.is(localStorage.getItem(LEGACY_ACCESS_ID), 'legacy-access');
});

test.serial('failed legacy write preserves the localStorage token', (t) => {
  globalThis.localStorage = create_local_storage({
    [LEGACY_ACCESS_ID]: 'legacy-access',
  });
  const smart_secrets = create_smart_secrets({}, {
    write_fails: true,
  });
  const env = create_env(smart_secrets);

  migrate_legacy_oauth_tokens(env);

  t.is(localStorage.getItem(LEGACY_ACCESS_ID), 'legacy-access');
  t.false(smart_secrets.data.has(ACCESS_ID));
});

test.serial('failed secure readback preserves the localStorage token', (t) => {
  globalThis.localStorage = create_local_storage({
    [LEGACY_ACCESS_ID]: 'legacy-access',
  });
  const smart_secrets = create_smart_secrets({}, {
    readback_fails: true,
  });
  const env = create_env(smart_secrets);

  migrate_legacy_oauth_tokens(env);

  t.is(localStorage.getItem(LEGACY_ACCESS_ID), 'legacy-access');
});

test.serial('conflicting legacy tokens preserve both values without logging them', (t) => {
  globalThis.localStorage = create_local_storage({
    [LEGACY_ACCESS_ID]: 'legacy-access',
  });
  const smart_secrets = create_smart_secrets({
    [ACCESS_ID]: 'secure-access',
  });
  const env = create_env(smart_secrets);
  const warnings = [];
  const original_warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  t.teardown(() => {
    console.warn = original_warn;
  });

  migrate_legacy_oauth_tokens(env);

  t.is(localStorage.getItem(LEGACY_ACCESS_ID), 'legacy-access');
  t.is(smart_secrets.data.get(ACCESS_ID), 'secure-access');
  t.false(warnings.join(' ').includes('legacy-access'));
  t.false(warnings.join(' ').includes('secure-access'));
});

test.serial('logout deletes fixed, temporary, and localStorage tokens', (t) => {
  globalThis.localStorage = create_local_storage({
    [LEGACY_ACCESS_ID]: 'legacy-access',
    [LEGACY_REFRESH_ID]: 'legacy-refresh',
  });
  const smart_secrets = create_smart_secrets({
    [ACCESS_ID]: 'secure-access',
    [REFRESH_ID]: 'secure-refresh',
    [TEMPORARY_ACCESS_ID]: 'temporary-access',
    [TEMPORARY_REFRESH_ID]: 'temporary-refresh',
  });
  const env = create_env(smart_secrets);

  clear_smart_plugins_tokens(env);

  t.false(smart_secrets.data.has(ACCESS_ID));
  t.false(smart_secrets.data.has(REFRESH_ID));
  t.false(smart_secrets.data.has(TEMPORARY_ACCESS_ID));
  t.false(smart_secrets.data.has(TEMPORARY_REFRESH_ID));
  t.is(localStorage.getItem(LEGACY_ACCESS_ID), null);
  t.is(localStorage.getItem(LEGACY_REFRESH_ID), null);
});
