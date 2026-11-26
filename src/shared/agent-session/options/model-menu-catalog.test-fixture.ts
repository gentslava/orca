import type { AgentSessionModelCatalogResult } from '../agent-session-wire'

export const listedCodexModelMenu: AgentSessionModelCatalogResult = {
  origin: 'probe',
  fetchedAt: 1,
  listingNamesConfiguredModel: true,
  models: [
    {
      id: 'gpt-5.6-sol',
      label: 'GPT-5.6-Sol',
      isDefault: true,
      defaultEffort: 'low',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map((value) => ({
        value,
        label: value
      }))
    }
  ]
}
