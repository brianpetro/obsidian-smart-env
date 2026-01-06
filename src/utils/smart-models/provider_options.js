export const provider_options = {
  chat_completion_models: [
    {
      label: 'Open Router (cloud)',
      value: 'open_router',
    },
    {
      label: 'PRO: LM Studio (local, requires LM Studio app)',
      value: 'lm_studio',
      disabled: true,
    },
    {
      label: 'PRO: Ollama (local, requires Ollama app)',
      value: 'ollama',
      disabled: true,
    },
    {
      label: 'PRO: OpenAI (cloud)',
      value: 'openai',
      disabled: true,
    },
    {
      label: 'PRO: Google Gemini (cloud)',
      value: 'google',
      disabled: true,
    },
    {
      label: 'PRO: Cohere (cloud)',
      value: 'cohere',
      disabled: true,
    },
    {
      label: 'PRO: xAI Grok (cloud)',
      value: 'xai',
      disabled: true,
    },
    {
      label: 'PRO: Anthropic Claude (cloud)',
      value: 'anthropic',
      disabled: true,
    },
    {
      label: 'PRO: Deepseek (cloud)',
      value: 'deepseek',
      disabled: true,
    },
    {
      label: 'PRO: Azure OpenAI (cloud)',
      value: 'azure',
      disabled: true,
    },
  ],
  embedding_models: [
    {
      label: 'Transformers (easy, local, built-in)',
      value: 'transformers',
    },
    {
      label: 'PRO: LM Studio (local, requires LM Studio app)',
      value: 'lm_studio',
      disabled: true,
    },
    {
      label: 'PRO: Ollama (local, requires Ollama app)',
      value: 'ollama',
      disabled: true,
    },
    {
      label: 'PRO: OpenAI (cloud)',
      value: 'openai',
      disabled: true,
    },
    {
      label: 'PRO: Google Gemini (cloud)',
      value: 'gemini',
      disabled: true,
    },
    {
      label: 'PRO: Open Router (cloud)',
      value: 'open_router',
      disabled: true,
    },
  ],
  ranking_models: [
    {
      label: 'PRO: Cohere (cloud)',
      value: 'cohere',
      disabled: true,
    },
  ],
};
