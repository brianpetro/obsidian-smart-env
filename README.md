# Smart Environment for Obsidian

The shared local-first foundation behind Smart Plugins.

Smart Environment keeps sources, exclusions, models, indexing, and health consistent across the suite. Install the Smart Plugin for the workflow you want; Smart Environment coordinates the foundation behind it.

![Obsidian Source inspector showing the active note path, current indexing state, block coverage, state filters, and an indexed excerpt.](https://smartconnections.app/assets/environment-source-inspector-active-note-dramatic-3x2-dark-v3.2.1.png)

*Inspect how the active note is prepared without leaving Obsidian.*

[Settings](https://smartconnections.app/smart-environment/settings/) · [FAQ](https://smartconnections.app/smart-environment/faq/) · [v3 update guide](https://smartconnections.app/smart-environment/releases/3-0/) · [Issues](https://github.com/brianpetro/obsidian-smart-env/issues)

## Control what is indexed

Choose the sources and exclusions shared by Smart Plugins.

![Smart Environment settings showing source exclusions, block embedding, minimum lengths, and reset controls.](https://smartconnections.app/assets/environment-settings-sources-and-exclusions-current-documentation-1200x800-desktop-2026-08-05.png)

## Choose the model

Select and test the embedding model used by shared semantic features.

![Smart Environment model picker showing the Transformers provider, available embedding models, and controls to test or re-index the model.](https://smartconnections.app/assets/environment-built-in-embedding-model-picker-current-documentation-1280x720-desktop-2026-08-06.png)

## See what is ready

Embedding health separates Current, Missing, Skipped, and Unexpected states for Sources and Blocks.

![Smart Environment Embedding health showing indexed and eligible item counts, current and missing embeddings, vector memory, and separate Sources and Blocks states.](https://smartconnections.app/assets/environment-stats-embedding-health-editorial-3x2-dark-v3.2.1.png)

*Coverage shows whether eligible sources and blocks are prepared for the selected model.*

## Export when needed

Export selected Sources, Blocks, and optional embedding vectors.

![Smart Environment Export data dialog showing Sources and Blocks selected, optional embedding vectors, and a completed export.](https://smartconnections.app/assets/environment-export-data-completed-crop-desktop-publication-srgb-92d6b436e81b-2026-07-29.png)

## Local-first

Generated Environment data is stored under `.smart-env/` in the vault. Embeddings run on your device after the runtime and selected model files are downloaded. Provider-backed workflows send their prompt and selected context to the provider you configured.

## Updates

Update installed Smart Plugins together and restart Obsidian when prompted. When moving from older Smart Plugins, follow the [v3 update guide](https://smartconnections.app/smart-environment/releases/3-0/).

## For maintainers

Smart Environment is the shared first-party substrate for Smart Plugins. Repeated infrastructure belongs here; product-specific workflows stay in the plugin that owns them.

## License

Smart Environment is source-available under the [Smart Plugins License](LICENSE). See the [plain-English license guide](https://smartconnections.app/legal/license/) for common scenarios.