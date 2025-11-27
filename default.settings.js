export const default_settings = {
  is_obsidian_vault: true,
  smart_blocks: {
    embed_blocks: true,
    min_chars: 100,
  },
  smart_sources: {
    min_chars: 100,
    embed_model: {
      adapter: "transformers",
      transformers: {
        legacy_transformers: false,
        model_key: 'TaylorAI/bge-micro-v2',
      },
    },
    excluded_headings: '',
    file_exclusions: 'Untitled',
    folder_exclusions: '',
  },
  language: 'en',
  re_import_wait_time: 13,
  smart_chat_threads: {
    chat_model: {
      adapter: "ollama",
      ollama: {}
    },
  },
  smart_notices: {},
  smart_view_filter: {
    expanded_view: false,
    render_markdown: true,
    show_full_path: false,
  },
  version: "",
  new_user: true, // DEPRECATED: 2025-06-05 (use localStorage instead???)
  // 2025-11-26
  models: {
    embedding_platform: 'transformers',
  },
};