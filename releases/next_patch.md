v3.1.3 release notes available at https://smartconnections.app/smart-environment/releases/3-0/


- Reorganized source embed-input actions around adapter-first paths and keys, including `source_base_get_embed_input`, `source_canvas_get_embed_input`, and `source_rendered_get_embed_input`.
- Canvas and rendered sources now delegate shared embedding behavior through the action registry.
- Updated generated environment configuration and regression coverage for the new action hierarchy.


Added: new lookup strategies for semantic retrieval and enhance input validation

- Introduced `lookup_list_get_results_hyde` for document-based lookups without queries.
- Added `lookup_list_get_results_query` for query-only lookups, enforcing input constraints.
- Updated `lookup_list_get_results` to handle both query and hypothetical document inputs.
- Enhanced `pre_process` function to validate embedding requests and ensure proper input handling.
- Modified `LookupLists` to support document-only scopes and improved error handling for invalid inputs.
- Updated tests to cover new functionality and ensure correct behavior of lookup strategies.


Improved: Smart drag-and-drop functionality


Improve: Add overflow styling to sc-excluded-folders-header for better layout management


Improve: Refactor ribbon action registration and enhance related tests for runtime metadata handling (resolved: preserve ribbon icon ordering)


Improved: Refactor source watcher registration to eliminate redundant editor-change listener (reduces extraneous sources:modified events)


Add: Register Smart Connect Pro icon with SVG definition


Improved: Update descriptions in get_results and get_results_hyde for clarity on hypothetical_document usage
