### Switch embedding models without starting over

Change embedding models without deleting data saved for models you have already used. You also get more built-in model choices and faster processing for the default local model.

![[environment-built-in-embedding-model-picker-current-documentation-1280x720-desktop-2026-08-06.png]]

*Compare the expanded built-in model choices before choosing what should index your vault.*

### See what was skipped - and fix it

Environment stats makes skipped and unexpected items easier to investigate. Search the list, filter by reason, inspect the source behind a result, force a re-import, repair block embeddings, or optimize stored source data with backup validation.

Long source paths no longer get excluded during normal indexing simply because they exceed 200 characters.

![[environment-inspector-skipped-blocks-filter-crop-desktop-publication-srgb-c4826d611ed3-2026-07-29.png]]

*Filter skipped blocks by reason, then inspect the source behind each result.*

### Keep credentials in secure storage

API keys and legacy OAuth tokens now use shared secure storage, backed by Obsidian's native secret storage where available. Migration checks that secure storage can persist a secret before moving existing credentials.

### A calmer event feed

Open **View more** when you need the details behind an event, then load incoming events with **Show more** when you are ready. New activity no longer shifts the feed while you are reading.

### Full release notes

#### Models and indexing

- Switch embedding models without deleting previously saved embedding data.
- The default built-in embedding model now uses background-worker processing for improved performance.
- Improved local embedding batch-size handling and added batch-window and sorting configuration.
- Added more Transformers embedding models and support for selecting model revisions.
- Improved the model settings layout and added confirmation before deleting a model configuration.
- Added a way to re-index embeddings for the active model.
- Deselected blocks are excluded from embedding preparation, with automated checks for block selection.
- Improved embedding saves, memory-capacity reservation, and error handling during embedding processing.
- Pending source and block embeddings are saved before their in-memory stores are cleared when Smart Environment unloads. This lifecycle is now handled in Core.

#### Sources and stored data

- Removed the old 200-character source-path exclusion during normal use, with long paths supported through shared, sharded storage. The V2 per-source filename limit remains only in the one-time legacy migration.
- Improved file-link parsing in Canvas files.
- Added .gitignore exclusions and improved folder-exclusion handling.
- Standardized file and folder exclusion settings as lists and normalized how they are handled.
- Added **Re-import wait time** in Smart Environment settings to control the delay before automatic re-import.
- Added configurable delays for queued collection and event-log saves, with less frequent event-log writes.
- Improved Environment data export.

#### Diagnostics and recovery

- Improved Environment statistics and source inspection, including memory usage for embedding vectors and vector-file storage metrics.
- Added an inspector for skipped and unexpected source and block items, with search and reason filters.
- Collection cards now open item inspection. Inspector buttons, inputs, and accessibility labels have been improved, along with loading states and error handling.
- Source Inspector now offers a force re-import option.
- Environment stats now includes block-embedding integrity checks and repair controls.
- Added source-data optimization to Environment stats, including backup validation and error handling.
- Embedding-error events now include the provider's API response JSON for troubleshooting.

#### Credentials

- API keys and other secrets now use shared secure storage in Core, with Obsidian-native secret storage where available. This support is no longer Pro-only.
- Improved secret migration and legacy OAuth-token handling. Migration now checks that the secure-storage adapter can persist secrets before proceeding.

#### Notifications and navigation

- Notifications now offer **View more** to open event details.
- The events feed uses **Show more** to load new events instead of shifting the content automatically.
- Added notification help links and control over whether a notification shows a mute button.
- Invalid event values no longer crash event dialogs or their displays.
- Improved badge icons and added accessible tooltip labels.
- Plugin installation uses fewer notifications, links to release pages, and fewer unnecessary installation-state checks.
- Improved the Smart Plugins list dialog and header styling in fuzzy-search dialogs.
- Updated the Environment status-bar menu, added an Environment status option, and added buttons to the status view.
- Added a shared command for opening release notes, replacing separate per-view command registration.
- Fixed missing view icons by registering views before the workspace renders.
- Fixed hover navigation between adjacent submenus.
- Updated Obsidian-link handling to the newer protocol API.

#### Shared infrastructure and maintenance

- Added support for reading files as binary bytes.
- Added sharded source storage with numeric replay order, bounded append-file rotation, explicit compaction, and protection for legacy base-last commits. Rotation and compaction limits now use byte sizes instead of record counts.
- Core now handles collection-level binary vector loading and typed-array similarity calculations. Durable vector references (`file_i`) are saved only after the vector data they reference.
- Corrected the scope of vector-index operations and added shared retrieval of the strongest cosine-similarity matches across all embedded items in a collection.
- Standardized embedding-input preparation through shared actions, with dedicated handling for Bases, Canvas, and rendered sources.
- Updated Transformers to version 4.2.0 and removed unused model dependencies.
- Standardized menu registration, resolution, and building, and added shared registration for Command Palette and ribbon actions. Added automated checks for menu behavior.
- Improved parameter and event handling for menus, ribbon actions, Smart Plugins commands, and Environment Status View commands, with automated checks.
- Notification buttons can now use `btn_event_key` and `btn_event_payload` instead of `btn_callback`.
- Improved configuration-version handling and added automated checks for Environment creation.
- Removed an unused collection-settings component, updated shared configuration references, and simplified the internal organization of stats inspection.
- Added automated checks for exclusion rules, long source paths, and legacy filename exclusions.
- Updated to Smart Environment v3 and refreshed related version metadata.

#### Release publishing

- Generated release notes now include a last-updated date.
- Release uploads check for required assets and no longer create ZIP files during the upload step.
- GitHub release requests now use native fetch instead of Axios, with improved request-error handling.
- Release creation can read and reuse an existing release-notes file.
