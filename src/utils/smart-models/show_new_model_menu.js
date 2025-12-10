import { Menu } from 'obsidian';
import { provider_options } from './provider_options.js';
import { SmartModelModal } from '../../modals/smart_model_modal.js';



export function show_new_model_menu(models_collection, event, params = {}) {
  const providers = (provider_options[models_collection.collection_key] || [])
    .map(p => ({ ...p, disabled: !models_collection.env_config.providers[p.value] }));
  if (providers.length === 0) {
    if (event.target.tagName.toLowerCase() === 'button') {
      event.target.disabled = true;
      event.title = 'No providers available to create new models.';
    }
  } else {
    // render context Menu
    const menu = new Menu();
    providers.forEach(provider => {
      menu.addItem((item) => {
        item.setTitle(provider.label);
        if (provider.disabled) {
          item.setDisabled(true);
        }
        item.onClick(async () => {
          if (typeof params.on_before_new === 'function') {
            await params.on_before_new();
          }
          const model = models_collection.new_model({ provider_key: provider.value });
          models_collection.settings.default_model_key = model.key;
          const on_new_close = async () => {
            // model.emit_event('model:changed');
          };
          new SmartModelModal(model, { on_close: on_new_close }).open();
        });
      });
    });
    menu.showAtMouseEvent(event);
  }
}
