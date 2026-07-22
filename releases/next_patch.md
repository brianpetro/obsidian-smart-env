

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
- Introduce should_exclude_path_for_length method in ObsidianFsAdapter to enforce path length limits.
- Modify ExcludedFoldersFuzzy and ExcludedSourcesModal to utilize the new path length policy.
- Normalize exclusion lists in utils to ensure consistent handling.
- Add tests for exclusion logic and path length policy.
- Enhance CSS for fuzzy header display.


Update Transformers library version to 4.2.0 for improved functionality


Add embed_input_action_key getter to Bases, Canvas, and Rendered source adapters


improved: get_embed_input delegates to actions architecture for improved flexibility


Added: command and ribbon action registration


Added generic release notes opener as command action (migrating away from ItemView registering it's own commands)


Improved: Prevent erroneous event values from crashing modal/renderer
