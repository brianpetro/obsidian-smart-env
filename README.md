# obsidian-smart-env

This package extends [`smart-environment`](https://github.com/brianpetro/jsbrains) for Obsidian-specific use-cases. It checks for an existing `SmartEnv` singleton in `window.smart_env` and, if absent, initializes one.

## Usage

```js
import { init_obsidian_smart_env } from 'obsidian-smart-env';
import { plugin_specific_config } from './smart-env.config.js';

(async () => {
  const env = await init_obsidian_smart_env(plugin_specific_config);
  // env now references the shared SmartEnv instance
})();
```
### Example merging collections

```js
const plugin_specific_config = {
  collections: {
    my_obsidian_collection: {
      class: MyObsidianCollectionClass,
      // ...
    }
  }
};

(async () => {
  const env = await init_obsidian_smart_env(plugin_specific_config);
  // The environment will have merged in 'my_obsidian_collection'
})();
```