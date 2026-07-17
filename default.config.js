import { SmartFs } from 'smart-file-system';
import { ObsidianFsAdapter } from './src/adapters/smart-fs/obsidian.js';
import { SmartView } from 'smart-view';
import { SmartViewObsidianAdapter } from 'smart-view/adapters/obsidian.js';
import { SmartSources, SmartSource } from 'smart-sources';
import { AjsonMultiFileSourcesDataAdapter } from "smart-sources/adapters/data/ajson_multi_file.js";
import { ObsidianMarkdownSourceContentAdapter } from "./adapters/smart-sources/obsidian_markdown.js";
import { BasesSourceContentAdapter } from "./adapters/smart-sources/bases.js";
import { RenderedSourceContentAdapter } from "./adapters/smart-sources/rendered.js";
import { CanvasSourceContentAdapter } from "./adapters/smart-sources/canvas.js";
import { ExcalidrawSourceContentAdapter } from "./adapters/smart-sources/excalidraw.js";
// import { SmartBlocks, SmartBlock } from 'smart-blocks';
// import { AjsonMultiFileBlocksDataAdapter } from "smart-blocks/adapters/data/ajson_multi_file.js";
// import { MarkdownBlockContentAdapter } from "smart-blocks/adapters/markdown_block.js";
// local embedding model
import { SmartEmbedModel } from "smart-embed-model";
import { SmartEmbedTransformersIframeAdapter } from "smart-embed-model/adapters/transformers_iframe.js";
// actions architecture
import smart_block from "smart-blocks/smart_block.js";
import smart_source from "smart-sources/smart_source.js";
import { parse_blocks } from "smart-blocks/content_parsers/parse_blocks.js";
import { merge_env_config } from 'smart-environment/utils/merge_env_config.js';
// smart components
import smart_components from 'smart-components';
import context_items from 'smart-contexts/context_items.js';
import event_logs from './src/collections/event_logs.js';
// base context UX
import { ContextModal } from './src/modals/context_selector.js';
import { NotificationsFeedModal } from './src/modals/notifications_feed_modal.js';
import { MilestonesModal } from './src/modals/milestones_modal.js';
import { BrowseSmartPlugins } from './src/modals/browse_plugins_modal.js';
// 2025-11-26
import { default_settings } from './default.settings.js';

const smart_env_config = {
  env_path: '',
  modules: {
    smart_fs: {
      class: SmartFs,
      adapter: ObsidianFsAdapter,
    },
    smart_view: {
      class: SmartView,
      adapter: SmartViewObsidianAdapter,
    },
    smart_embed_model: {
      class: SmartEmbedModel,
      adapters: {
        transformers: SmartEmbedTransformersIframeAdapter,
      },
    },
  },
  collections: {
    context_items,
    event_logs,
    smart_components,
    smart_sources: {
      collection_key: 'smart_sources',
      class: SmartSources,
      data_adapter: AjsonMultiFileSourcesDataAdapter,
      source_adapters: {
        "md": ObsidianMarkdownSourceContentAdapter,
        "txt": ObsidianMarkdownSourceContentAdapter,
        "excalidraw.md": ExcalidrawSourceContentAdapter,
        "base": BasesSourceContentAdapter,
        "canvas": CanvasSourceContentAdapter,
        "rendered": RenderedSourceContentAdapter,
        // "canvas": MarkdownSourceContentAdapter,
        // "default": MarkdownSourceContentAdapter,
      },
      content_parsers: [
        parse_blocks,
      ],
      // process_embed_queue: false,
      process_embed_queue: true, // trigger embedding on load
      load_order: 100, // load last
    },
    // smart_blocks: {
    //   collection_key: 'smart_blocks',
    //   class: SmartBlocks,
    //   data_adapter: AjsonMultiFileBlocksDataAdapter,
    //   block_adapters: {
    //     "md": MarkdownBlockContentAdapter,
    //     "txt": MarkdownBlockContentAdapter,
    //     "excalidraw.md": MarkdownBlockContentAdapter,
    //     // "canvas": MarkdownBlockContentAdapter,
    //   },
    // },
  },
  items: {
    smart_block,
    smart_source,
  },
  default_settings,
  // begin obsidian-smart-env specific modules (need to update build_env_config.js to handle)
  modals: {
    context_selector: {
      class: ContextModal,
      default_suggest_action_keys: [
        'context_suggest_sources',
      ]
    },
    milestones_modal: {
      class: MilestonesModal,
    },
    notifications_feed_modal: {
      class: NotificationsFeedModal,
    },
    browse_plugins_modal: {
      class: BrowseSmartPlugins,
    },
  },
};
import { smart_env_config as dist_config } from './smart_env.config.js';
merge_env_config(smart_env_config, dist_config);
smart_env_config.items.smart_block.actions = {
  ...smart_block.actions,
  ...smart_env_config.items.smart_block.actions,
};
export default smart_env_config;
