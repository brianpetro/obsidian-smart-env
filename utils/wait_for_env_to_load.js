import { Platform } from "obsidian";
// TODO: this should utilize SmartEnv wait_for static method (2026-03-30)
export async function wait_for_env_to_load(scope, opts = {}) {
  const { wait_for_states = ['loaded'] } = opts;
  const container = scope.container || scope.containerEl;
  if (!wait_for_states.includes(scope.env?.state)) {
    let clicked_load_env = false;
    while (scope.env.state === 'init' && Platform.isMobile && !clicked_load_env) {
      if(container){
        // button to load env
        container.empty();
        scope.env.smart_view.safe_inner_html(container, '<button>Load Smart Environment</button>');
        container.querySelector('button').addEventListener('click', () => {
          clicked_load_env = true;
          if (typeof scope.env.start_mobile_env_load === 'function') {
            scope.env.start_mobile_env_load({ source: 'wait_for_env_to_load' });
            return;
          }
          scope.env.load(true);
        });
      }else{
        console.log('Waiting for env to load (mobile)...');
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    // wait for entities to be initialized
    while (!wait_for_states.includes(scope.env.state)) {
      if(container){
        const loading_msg = scope.env?.obsidian_is_syncing ? "Waiting for Obsidian Sync to finish..." : "Loading Obsidian Smart Environment...";
        container.empty();
        // set loading message
        scope.env.smart_view.safe_inner_html(container, loading_msg);
      }else{
        console.log('Waiting for env to load...');
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
