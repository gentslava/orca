export const OPTIONS = {
  models: [
    {
      id: 'gpt-live',
      label: 'GPT Live',
      isDefault: true,
      defaultEffort: 'medium',
      efforts: [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' }
      ]
    },
    {
      id: 'gpt-fast',
      label: 'GPT Fast',
      isDefault: false,
      defaultEffort: 'low',
      efforts: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' }
      ]
    }
  ],
  current: { model: 'gpt-live', effort: 'medium' }
}

export const FAST_OPTIONS = {
  ...OPTIONS,
  models: OPTIONS.models.map((model) => ({ ...model, supportsFastMode: true })),
  fastModeSupport: { supported: true },
  current: { ...OPTIONS.current, fastMode: false, confirmed: ['fastMode'] }
}

export const HOST_CATALOG = {
  origin: 'live-session',
  models: [
    {
      id: 'gpt-hosted',
      label: 'GPT Hosted',
      isDefault: true,
      efforts: [{ value: 'high', label: 'High' }]
    }
  ],
  fetchedAt: 1_000
}

export const LIVE_OPTIONS = {
  models: [
    { id: 'gpt-5.5', label: 'GPT-5.5', isDefault: true, efforts: [] },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', efforts: [] }
  ],
  current: { model: 'gpt-5.5', confirmed: ['model'] }
}

// The account's saved list, naming the launch seed's model.
export const SAVED_LIST = {
  origin: 'probe',
  models: [
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      isDefault: true,
      efforts: [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' }
      ]
    },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', efforts: [] }
  ],
  fetchedAt: 1_000
}
