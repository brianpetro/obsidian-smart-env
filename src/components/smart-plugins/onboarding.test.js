import test from 'ava';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  build_onboarding_start_url,
  get_onboarding_signup_setting_copy,
} from './onboarding_signup.js';

function load_component(settings, open_calls, requests) {
  const file_path = new URL('./onboarding.js', import.meta.url);
  const source = fs.readFileSync(file_path, 'utf8')
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function)/g, '')
    .concat('\nmodule.exports = { render };\n')
  ;
  const context = vm.createContext({
    module: { exports: {} },
    build_onboarding_start_url,
    get_onboarding_signup_setting_copy,
    Setting: class {
      constructor(container) {
        this.container = container;
        this.buttons = [];
        settings.push(this);
      }
      setName(name) {
        this.name = name;
        return this;
      }
      setDesc(description) {
        this.description = description;
        return this;
      }
      addButton(callback) {
        const button = {
          setButtonText(text) { this.text = text; },
          onClick(handler) { this.click = handler; },
        };
        callback(button);
        this.buttons.push(button);
      }
    },
    requestUrl(request) {
      requests.push(request);
      throw new Error('Onboarding must not request referral stats');
    },
    window: {
      open(url, target) { open_calls.push({ url, target }); },
    },
  });
  new vm.Script(source, { filename: file_path.pathname }).runInContext(context);
  return context.module.exports.render;
}

for (const [name, params] of [
  ['signed out', {}],
  ['active subscriber', { token: 'active-token', sub_exp: Date.now() + 86400000 }],
  ['expired subscriber', { token: 'expired-token', sub_exp: 1 }],
  ['invalid session', { token: 'invalid-token', auth_state: 'invalid' }],
]) {
  test(`Onboarding signup works without referral requests for ${name}`, async (t) => {
    const settings = [];
    const open_calls = [];
    const requests = [];
    const events = [];
    const container = {};
    const render = load_component(settings, open_calls, requests);
    const env = {
      events: {
        emit(event_key, payload) { events.push({ event_key, ...payload }); },
      },
    };
    const view = {
      create_doc_fragment(html) {
        t.true(html.includes('smart-plugins-onboarding-component'));
        return { firstElementChild: container };
      },
    };

    t.is(await render.call(view, env, params), container);
    t.is(settings.length, 1);
    t.is(settings[0].name, 'Get the 12-part getting started email series');
    t.is(settings[0].description, get_onboarding_signup_setting_copy().description);
    t.is(settings[0].buttons.length, 1);
    t.is(settings[0].buttons[0].text, 'Subscribe');

    settings[0].buttons[0].click();
    t.deepEqual(requests, []);
    t.deepEqual(open_calls, [{
      url: 'https://smartconnections.app/onboarding/start/?source=plugins_settings',
      target: '_external',
    }]);
    t.deepEqual(events, [{
      event_key: 'onboarding:opened_signup',
      event_source: 'smart_plugins_onboarding',
    }]);
  });
}
