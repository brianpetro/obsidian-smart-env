import test from 'ava';
import { SecretComponent } from 'obsidian';
import {
  create_settings_group_rerender,
  render_settings_group,
} from './render_settings_config.js';

function create_test_element() {
  return {
    createDiv: create_test_element,
    setText() {},
    addClass() {},
  };
}

test('rerender clears container and calls render_group', t => {
  const call_order = [];
  const scope = { settings: {} };
  const container = {
    replaceChildren() {
      call_order.push('cleared');
    },
  };
  const render_group = (...args) => {
    call_order.push(args);
    return { rendered: true };
  };
  const group_params = { heading_btn: null };

  const rerender = create_settings_group_rerender(scope, {
    container,
    group_name: 'Group',
    settings_config: {},
    group_params,
    render_group,
  });

  const result = rerender();

  t.is(call_order[0], 'cleared');
  t.is(call_order.length, 2);
  t.deepEqual(call_order[1], ['Group', scope, {}, container, group_params]);
  t.deepEqual(result, { rendered: true });
});

test('rerender returns null without container', t => {
  const rerender = create_settings_group_rerender({}, {
    container: null,
    group_name: 'Group',
    settings_config: {},
    group_params: {},
  });

  t.is(rerender(), null);
});

test.serial('secret setting stores the selected credential ID without writing the keyring', t => {
  const original_set_value = SecretComponent.prototype.setValue;
  const original_on_change = SecretComponent.prototype.onChange;
  const keyring_writes = [];
  let secret_component;

  SecretComponent.prototype.setValue = function set_value(value) {
    secret_component = this;
    this.test_value = value;
    return this;
  };
  SecretComponent.prototype.onChange = function on_change(callback) {
    secret_component = this;
    this.test_on_change = callback;
    return this;
  };

  try {
    const scope = {
      env: {
        obsidian_app: {
          secretStorage: {
            setSecret(...args) {
              keyring_writes.push(args);
            },
          },
        },
      },
      settings: {
        api_key: 'openai-work',
      },
    };

    render_settings_group(
      'Model',
      scope,
      {
        api_key: {
          name: 'API key',
          type: 'secret',
        },
      },
      create_test_element(),
    );

    t.truthy(secret_component);
    t.is(secret_component.test_value, 'openai-work');

    secret_component.test_on_change('openai-personal');

    t.is(scope.settings.api_key, 'openai-personal');
    t.deepEqual(keyring_writes, []);
  } finally {
    SecretComponent.prototype.setValue = original_set_value;
    SecretComponent.prototype.onChange = original_on_change;
  }
});
