/**
 * utils for getting recent X
 */

export function get_recent_paths (app = window.app) {
  return app.workspace.getLastOpenFiles();
}

export function get_recent_sources(env) {
  const recent_paths = get_recent_paths(env.obsidian_app);
  return env.smart_sources.get_many(recent_paths);
}
