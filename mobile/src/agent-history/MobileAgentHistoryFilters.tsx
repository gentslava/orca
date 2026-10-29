import { Pressable, Text, TextInput, View } from 'react-native'
import type { AiVaultScope } from '../../../src/shared/ai-vault-types'
import type { Translate } from '../i18n/mobile-i18n'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors } from '../theme/mobile-theme'
import { styles } from './agent-history-styles'

function scopeTabs(t: Translate): { scope: AiVaultScope; label: string }[] {
  return [
    { scope: 'workspace', label: t('agentHistory.panel.workspace', 'Workspace') },
    { scope: 'project', label: t('agentHistory.panel.project', 'Project') },
    { scope: 'all', label: t('agentHistory.panel.all', 'All') }
  ]
}

export function MobileAgentHistoryFilters({
  scope,
  onSelectScope,
  query,
  setQuery
}: {
  scope: AiVaultScope
  onSelectScope: (scope: AiVaultScope) => void
  query: string
  setQuery: (query: string) => void
}) {
  const t = useMobileTranslation()
  return (
    <>
      <View style={styles.scopeTabs}>
        {scopeTabs(t).map((tab) => {
          const active = scope === tab.scope
          return (
            <Pressable
              key={tab.scope}
              style={[styles.scopeTab, active && styles.scopeTabActive]}
              onPress={() => onSelectScope(tab.scope)}
            >
              <Text style={[styles.scopeTabText, active && styles.scopeTabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('agentHistory.panel.placeholder', 'Search sessions, repo:, path:')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </>
  )
}
