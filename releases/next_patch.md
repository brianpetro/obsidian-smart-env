feat: support long source paths with shared sharded persistence

- Removed the legacy 200-character runtime exclusion from the core Obsidian filesystem adapter.
- Kept the V2 per-source filename limit only inside the one-time legacy migration path.

fix: own embedding-store unload lifecycle in core

- Flush and clear source and block embedding stores during environment unload.




feat: Update badge HTML generation to use aria-label for tooltips and optimize icon display


Make named context badges clickable in tree
Update tree if included named context is updated


Fixed: Ollama chat adapter should work regardless of whether model info contains context limit info.

Improved Smart Plugins install flow: Fewer notifications; Added links to release pages


Added: `btn_event_key` with `btn_event_payload` as alternative to `btn_callback` in event payloads


Improved: removal in context tree should allow multiple subsequent removals without having to wait on background precesses and rerendering.


Improved: SmartEnv config version handling and add tests for environment creation lifecycle


Improved: remove unused collection settings component and update references in smart_env_config


Improved: added missing context item handling: missing items are now highlighted in the builder and a notification is emitted with option to remove the missing item


Improved: refactor context remove path utilities and add tests for normalization and matching logic


Improved: add last updated date to the latest release markdown output


Improved: refactor upload_release_assets to remove zip creation and enforce required asset checks


Improved: removed extraneous model dependencies


refactor: remove axios dependency and implement fetch for GitHub API requests

- Removed axios from dependencies and refactored the code to use the native fetch API for making GitHub API requests.
- Added a function to read existing release notes from a file.
- Updated the release creation process to optionally use existing release notes.
- Enhanced error handling for GitHub API requests.
- Adjusted asset upload logic to ensure required assets are present.


Improved: streamline plugin installation behavior by removing unnecessary state checks


Improved: Core context copy now runs queued source re-imports before compiling direct clipboard exports and emits an info notice only when queued changes exist.


Improved: Smart Context: added current file indication to output and link tree


Added: re-import wait time setting to Smart Environment settings.

- Added configurable debounce timing for queue saves in Collection and EventLogs (reduce event logs save frequency to improve performance)



improved: canvas file link parsing


fixed: used new Obsidian protocol API

- Notifications improved:
	- Added "View more" button to notifications to open the events modal with the details
	- Added "Show more" button to notifications/events feed modal instead of auto-rendering new events to prevent "jank" when viewing

added: implement read_binary method to read files as binary bytes


added: implement help link functionality and mute button visibility control in notifications


added: implement menu registration and building functions for enhanced menu actions


added: implement gitignore exclusions and enhance folder exclusion functionality


added: enhance merge_template function to include section in key variable if present in link (mediated through context_item data)


added: implement context actions for clearing context, copying link tree, and copying text to clipboard as menu actions


Added: context item menu actions
Migrated: SMart Env status bar menu to new menu actions architecture


Added: context tree leaf renders source menu


Improved Smart Plugins list modal


Add resolve_menu_actions function and corresponding tests


- Update default settings to use arrays for file and folder exclusions.
- Normalize exclusion lists in utils to ensure consistent handling.
- Add tests for exclusion logic.
- Enhance CSS for fuzzy header display.


Update Transformers library version to 4.2.0 for improved functionality


Add embed_input_action_key getter to Bases, Canvas, and Rendered source adapters


improved: get_embed_input delegates to actions architecture for improved flexibility


Added: command and ribbon action registration


Added generic release notes opener as command action (migrating away from ItemView registering it's own commands)


Improved: Prevent erroneous event values from crashing modal/renderer


Fixed: item view registrations should register before workspace rendering so that the icons display properly


Improved: Add params handling for menu actions and ribbon actions to support event propagation


Improved: Implement drag-and-drop functionality with Smart item identity handling


Improved: Enhance batch size handling and add batch window and sorting configurations for TransformersIframeEmbeddingModelAdapter


Improved: Refactor command registration for Smart Plugins and Environment Status View, adding parameter handling and tests

Improved: source persistence and vector files

- Added `AjsonShardedSourcesDataAdapter` with numeric sequential replay, bounded append rotation, explicit compaction, and legacy base-last commit protection.
- Changed source shard rotation and compaction from record-count limits to byte limits
- Moved collection-scoped binary vector loading, durable `file_i` refs, vector-before-ref checkpoints, and typed-array similarity into Smart Env v2.


Add memory usage calculation for embedding vectors and update env_stats display


Added: worker implementation for better default built-in model performance.


Improved: embedding model handling: make switching between models possible without losing embedding data


feat: support long source paths and improve embedding unload lifecycle

- Removed the 200-character limit for source paths in the filesystem adapter.
- Updated the unload process to flush and clear embedding stores during environment unload.
- Enhanced tests to validate handling of long source paths and legacy filename exclusions.


Improved: New v2 context builder UI


Improved environment statistics handling and source inspection

Improved: Environment data export

Add lookup_list_get_results action and integrate into settings configuration


Added: block read tool action


Improved: environment stats inspector with detailed diagnostics and improved UI

- Added a new inspector section for inspecting skipped and unexpected items in collections.
- Implemented search functionality and reason filtering in the inspector.
- Improved styling for buttons and inputs within the inspector for better accessibility and usability.
- Updated collection cards to allow inspection of items, with appropriate aria attributes for accessibility.
- Enhanced loading states and error handling in the inspector.
- Refactored related functions for better code organization and readability.


Improved: refine block embedding logic to exclude deselected blocks and added tests for embedding selection


Added: source data optimization functionality with backup validation and error handling


Added: force re-import functionality to source inspector


move vec index logic to correct scope


Enhance context_to_md_tree to support filtering and add corresponding tests


Added: Implement source data optimization UI in environment stats modal


Add env status menu action to status bar and add buttons to status view


Improved: embedding save logic


Improved: context_suggest_sources with source filter support


Improved: include API response JSON in embedding error events


Added: implement reindex_embeddings method for active embedding model


Improved: added additional Transformers models and revision support


Improved: enhance model settings UI and functionality with delete confirmation and better layout


Updated: Smart Environment v3


Improved: update version numbers and remove exclusion metadata from context items


Improved: vector memory/capacity reservation and error handling in embeddings pipeline


Improved: implement SmartSecrets and ObsidianSecretsAdapter for secure storage management


Added: top_k action for improved cosine similarity across all embedded items in a collection
