/**
 * Open the Smart Context named-contexts dashboard.
 *
 * @this {import('smart-contexts').SmartContexts} Collection scope
 * @param {object} [params={}]
 * @param {object} [params.plugin]
 * @returns {boolean}
 */
export function plugin_open_release_notes(params = {}) {
  params.plugin?.ReleaseNotesView?.open(params.plugin?.app?.workspace);
}

export const commands = {
  'release-notes': {
    name: 'Open: Release Notes',

    register_when({ plugin }) {
      const has_release_notes_view = !!plugin.ReleaseNotesView;
      return has_release_notes_view;
    },

    params({ plugin }) {
      return { plugin };
    },

    get_scope({ env }) {
      return env;
    },
  },
};