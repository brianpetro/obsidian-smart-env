// V1 compatibility test. Dependency:
// - ./context_selector.js
import test from 'ava';
import { ContextModal } from './context_selector.js';

test('legacy Context Selector discovers top-level scopes from smart_context:suggest placements', (t) => {
  const smart_context = { key: 'Context' };
  const calls = [];
  const modal = {
    smart_context,
    params: {},
    modal_key: 'context_selector',
    env: {
      config: { modals: { context_selector: {} } },
      resolve_menu_actions(menu_key, scope, params) {
        calls.push({ menu_key, scope, params });
        return [
          {
            action_key: 'context_suggest_sources',
            title: 'Notes',
            disabled: false,
            menu_only: false,
          },
          {
            action_key: 'context_suggest_disabled',
            title: 'Disabled',
            disabled: true,
            menu_only: false,
          },
        ];
      },
    },
  };

  const actions = ContextModal.prototype.get_suggest_actions.call(modal, {
    surface: 'context_selector',
  });

  t.is(calls[0].menu_key, 'smart_context:suggest');
  t.is(calls[0].scope, smart_context);
  t.is(calls[0].params.modal, modal);
  t.is(calls[0].params.surface, 'context_selector');
  t.deepEqual(actions.map((action) => action.action_key), [
    'context_suggest_sources',
  ]);
});

test('configured defaults do not hide placed scopes, but explicit modal keys do', (t) => {
  const configured_action_keys = ['context_suggest_sources'];
  const modal = {
    smart_context: {},
    modal_key: 'context_selector',
    params: {
      default_suggest_action_keys: configured_action_keys,
    },
    env: {
      config: {
        modals: {
          context_selector: {
            default_suggest_action_keys: configured_action_keys,
          },
        },
      },
      resolve_menu_actions() {
        return [
          {
            action_key: 'context_suggest_sources',
            disabled: false,
            menu_only: false,
          },
          {
            action_key: 'context_suggest_contexts',
            disabled: false,
            menu_only: false,
          },
        ];
      },
    },
  };

  t.deepEqual(
    ContextModal.prototype.get_suggest_actions.call(modal)
      .map((action) => action.action_key),
    ['context_suggest_sources', 'context_suggest_contexts'],
  );

  modal.params.default_suggest_action_keys = ['context_suggest_contexts'];
  t.deepEqual(
    ContextModal.prototype.get_suggest_actions.call(modal)
      .map((action) => action.action_key),
    ['context_suggest_contexts'],
  );
});

test('legacy source-scope rows keep the existing fuzzy-list shape', async (t) => {
  const run_calls = [];
  const modal = {
    env: {
      config: {
        actions: {
          context_suggest_sources: {
            display_name: 'Add sources',
          },
        },
      },
    },
    inputEl: { focus() {} },
    update_suggestions(suggest_action) {
      return suggest_action({ modal: this });
    },
    run_suggest_action: ContextModal.prototype.run_suggest_action,
  };
  const scopes = ContextModal.prototype.get_suggest_scopes.call(modal, [
    {
      action_key: 'context_suggest_sources',
      title: 'Notes',
      run(params) {
        run_calls.push(params);
        return [];
      },
    },
  ]);

  t.deepEqual(Object.keys(scopes[0]).sort(), [
    'display',
    'key',
    'select_action',
  ]);
  t.is(scopes[0].display, 'Add sources');

  await scopes[0].select_action();
  t.is(run_calls[0].modal, modal);
  t.is(
    run_calls[0].event_source,
    'context_selector.suggest:context_suggest_sources',
  );
});

test('legacy scope discovery falls back to configured action keys when placements are unavailable', (t) => {
  const modal = {
    default_suggest_action_keys: [
      'context_suggest_sources',
      'context_suggest_contexts',
    ],
    env: {
      config: {
        actions: {
          context_suggest_sources: { display_name: 'Add sources' },
          context_suggest_contexts: { display_name: 'Add named contexts' },
        },
      },
    },
    item_or_collection: {
      actions: {
        context_suggest_sources() {},
        context_suggest_contexts() {},
      },
    },
  };

  const scopes = ContextModal.prototype.get_suggest_scopes.call(modal);

  t.deepEqual(scopes.map((scope) => scope.key), [
    'context_suggest_sources',
    'context_suggest_contexts',
  ]);
});
