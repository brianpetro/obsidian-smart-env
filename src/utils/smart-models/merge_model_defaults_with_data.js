// merge with defaults saved in model config
export function merge_model_defaults_with_data(model) {
  const model_defaults = model.data.provider_models?.[model.data.model_key] || {};
  const adapter_defaults = model.ProviderAdapterClass.defaults || {};
  model.data = {
    ...model.data,
    ...adapter_defaults,
    ...model_defaults,
  };
}
