import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowDownAZ,
  ChevronLeft,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Plus,
  Settings
} from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import { MobileAgentIcon } from '../components/MobileAgentIcon'
import { AgentStateDot } from '../components/AgentStateDot'
import { StatusDot } from '../components/StatusDot'
import { MobileSearchField } from '../components/MobileSearchField'
import { ConversationAgentSheet } from './conversation-agent-sheet'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { AuthFailedBanner } from '../components/AuthFailedBanner'
import { formatAgentTypeLabel } from '../../../src/shared/agent-type-label'
import type { HostScreenController } from './use-host-screen-controller'
import { buildProjectConversations } from './project-conversations'
import { useConversationActions } from './use-conversation-actions'
import { conversationCopy, conversationTimeAgo } from './conversation-copy'
import { conversationStyles as styles } from './conversation-styles'
import { buildProjectSectionCatalog } from '../worktree/project-section-catalog'
import { ConversationProjectOrderSheet } from './conversation-project-order-sheet'
import { ConversationDetailsSheet } from './conversation-details-sheet'
import { useConversationPreferences } from './use-conversation-preferences'
import { useConversationDetails } from './use-conversation-details'
import { PROJECT_CONVERSATION_PAGE_SIZE } from '../../../src/shared/project-conversation-list'
import { useProjectConversations } from './use-project-conversations'

export function HostConversations({
  controller,
  onWorkspaces
}: {
  controller: HostScreenController
  onWorkspaces: () => void
}) {
  const copy = conversationCopy()
  const { hostId, connState, actions, state } = controller
  const data = useProjectConversations(controller)
  const conversationPreferences = useConversationPreferences(controller)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState(false)
  const [sorting, setSorting] = useState(false)
  const [archived, setArchived] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<ReadonlySet<string>>(new Set())
  const { details, setDetails } = useConversationDetails({
    client: controller.client,
    hostId,
    generation: controller.client?.getGeneration?.() ?? 0
  })
  const { busy, error, newChat, setNewChat, prepare, launch, open } = useConversationActions(
    controller,
    data
  )
  const projectCatalog = useMemo(
    () =>
      buildProjectSectionCatalog(
        controller.projectCatalog,
        [...controller.sectionsResult.repoById.values()],
        state.view.filters.visibleHostIds,
        controller.projectOrderBy,
        state.view.personalProjectOrder
      ),
    [
      controller.projectCatalog,
      controller.sectionsResult.repoById,
      controller.projectOrderBy,
      state.view
    ]
  )
  const projects = useMemo(
    () =>
      buildProjectConversations({
        workspaces: data.workspaces,
        repos: [...controller.sectionsResult.repoById.values()],
        tabs: data.tabs,
        history: data.history,
        now: controller.now,
        untitled: copy.untitled,
        query,
        projectCatalog,
        preferences: conversationPreferences.preferences,
        archived
      }),
    [
      data.workspaces,
      controller.sectionsResult.repoById,
      data.tabs,
      data.history,
      controller.now,
      copy.untitled,
      query,
      projectCatalog,
      conversationPreferences.preferences,
      archived
    ]
  )

  const sections = useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        totalCount: project.data.length,
        data:
          query.trim() || expandedProjects.has(project.key)
            ? project.data
            : project.data.slice(0, PROJECT_CONVERSATION_PAGE_SIZE)
      })),
    [projects, query, expandedProjects]
  )
  const connected = connState === 'connected'
  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={actions.leaveHost}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Back to hosts"
          >
            <ChevronLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>{archived ? copy.archived : copy.projects}</Text>
            <View style={styles.host}>
              <StatusDot state={connState} />
              <Text style={styles.meta} numberOfLines={1}>
                {controller.hostDisplay.title}
              </Text>
            </View>
          </View>
          {controller.embedded && controller.onHideSidebar ? (
            <Pressable
              onPress={controller.onHideSidebar}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Hide sidebar"
            >
              <ChevronLeft size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setOptions(true)}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={copy.settings}
          >
            <Settings size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </SafeAreaView>
      {(connState === 'auth-failed' || controller.relayRecovery.pairingRejected) && (
        <AuthFailedBanner
          canRetry={controller.forceReconnectHost !== null}
          onRetry={() => void controller.forceReconnectHost?.(hostId)}
          onRepair={() => controller.router.push('/pair-scan')}
          onRemove={() => state.setConfirmRemoveHost(true)}
        />
      )}
      <View style={styles.search}>
        <View style={styles.searchField}>
          <MobileSearchField
            value={query}
            onChangeText={setQuery}
            placeholder={copy.search}
            accessibilityLabel={copy.search}
          />
        </View>
        <Pressable
          onPress={() => setSorting(true)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={copy.projectOrder}
        >
          <ArrowDownAZ size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
      {!connected && <Text style={styles.notice}>{copy.offline}</Text>}
      {error || state.actionError || conversationPreferences.error ? (
        <Text accessibilityRole="alert" style={[styles.notice, styles.failure]}>
          {error || state.actionError || conversationPreferences.error}
        </Text>
      ) : null}
      {data.failed || state.catalogError ? <Text style={styles.notice}>{copy.failed}</Text> : null}
      {data.loading ? (
        <ActivityIndicator
          style={styles.spinner}
          color={colors.textMuted}
          accessibilityLabel={copy.loading}
        />
      ) : !data.complete && connected ? (
        <Text style={styles.notice}>{copy.legacy}</Text>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.key}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.list,
          { paddingBottom: controller.insets.bottom + 24 },
          controller.isWideLayout && !controller.embedded
            ? { maxWidth: controller.contentMaxWidth, width: '100%', alignSelf: 'center' }
            : null
        ]}
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={data.onRefresh}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{state.worktreesLoaded ? copy.noProjects : copy.loading}</Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.section}>
            <MessageSquare size={16} color={colors.textSecondary} />
            <View style={styles.sectionName}>
              <Text style={styles.projectTitle} numberOfLines={1}>
                {section.title}
              </Text>
              {section.hostLabel || section.hostHealthLabel ? (
                <Text style={styles.meta}>
                  {[section.hostLabel, section.hostHealthLabel].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            {section.repo && controller.settings.supportsPersonalProjectOrder ? (
              <Pressable
                onPress={() =>
                  section.repo && void controller.settings.toggleProjectPin(section.repo)
                }
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={
                  section.projectPreference?.pinned ? copy.unpinProject : copy.pinProject
                }
                disabled={!connected}
              >
                <Pin
                  size={16}
                  color={section.projectPreference?.pinned ? colors.textPrimary : colors.textMuted}
                />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => prepare(section)}
              disabled={!connected || Boolean(section.hostHealthLabel) || busy !== null}
              style={[
                styles.newChat,
                (!connected || section.hostHealthLabel || busy !== null) && styles.disabled
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${copy.newChat}: ${section.title}`}
            >
              {busy === section.key ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Plus size={16} color={colors.textPrimary} />
              )}
              <Text style={styles.actionText}>{copy.newChat}</Text>
            </Pressable>
          </View>
        )}
        renderSectionFooter={({ section }) => (
          <>
            {section.totalCount > section.data.length ? (
              <Pressable
                onPress={() => setExpandedProjects((current) => new Set([...current, section.key]))}
                style={styles.agentButton}
                accessibilityRole="button"
              >
                <Text style={styles.actionText}>
                  {copy.showMore} ({section.totalCount - section.data.length})
                </Text>
              </Pressable>
            ) : null}
            {section.data.length === 0 ? <Text style={styles.empty}>{copy.empty}</Text> : null}
            {section.hostId.startsWith('ssh:') ? (
              <Text style={styles.empty}>{copy.ssh}</Text>
            ) : null}
          </>
        )}
        renderItem={({ item }) => (
          <View style={styles.row} testID="conversation-row">
            <Pressable
              onPress={() => open(item)}
              onLongPress={() => setDetails(item)}
              disabled={
                !connected || Boolean(item.workspace.hostContextHealthLabel) || busy !== null
              }
              style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <MobileAgentIcon agentId={item.agent ?? ''} size={20} />
              <View style={styles.rowText}>
                <View style={styles.rowMeta}>
                  {item.preferenceKey &&
                  conversationPreferences.preferences?.entries[item.preferenceKey]?.pinned ? (
                    <Pin size={12} color={colors.textSecondary} />
                  ) : null}
                  <Text style={[styles.rowTitle, styles.sectionName]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
                <View style={styles.rowMeta}>
                  <AgentStateDot
                    state={
                      !connected || item.workspace.hostContextHealthLabel
                        ? 'unverifiable'
                        : item.status === 'saved' || item.status === 'transcript'
                          ? 'idle'
                          : item.status
                    }
                  />
                  <Text style={styles.meta} numberOfLines={1}>
                    {[
                      item.agent ? formatAgentTypeLabel(item.agent) : null,
                      !connected || item.workspace.hostContextHealthLabel
                        ? copy.offline
                        : item.status === 'saved'
                          ? copy.saved
                          : item.status === 'transcript'
                            ? copy.transcript
                            : item.status === 'failed'
                              ? copy.failedState
                              : copy[item.status],
                      item.at ? conversationTimeAgo(item.at, controller.now) : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
              {busy === item.key ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => setDetails(item)}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={`${copy.details}: ${item.title}`}
            >
              <MoreHorizontal size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )}
      />
      <ConversationProjectOrderSheet
        visible={sorting}
        onClose={() => setSorting(false)}
        controller={controller}
      />
      <ActionSheetModal
        visible={options}
        title={copy.settings}
        onClose={() => setOptions(false)}
        actions={[
          {
            label: archived ? copy.back : copy.archived,
            onPress: () => setArchived((value) => !value)
          },
          { label: copy.workspaces, onPress: onWorkspaces },
          {
            label: copy.accounts,
            onPress: () => actions.navigateFromHostList(`/h/${encodeURIComponent(hostId)}/accounts`)
          },
          {
            label: copy.tasks,
            onPress: () => actions.navigateFromHostList(`/h/${encodeURIComponent(hostId)}/tasks`)
          },
          { label: copy.newWorkspace, onPress: actions.openNewWorktreeModal, disabled: !connected }
        ]}
      />
      <ConversationDetailsSheet
        details={details}
        onClose={() => setDetails(null)}
        hostTitle={controller.hostDisplay.title}
        canManage={conversationPreferences.supported}
        writing={conversationPreferences.writing}
        preferences={conversationPreferences.preferences}
        onPreference={conversationPreferences.setPreference}
        {...{ archived, connected }}
      />
      <ConversationAgentSheet
        visible={newChat !== null}
        agents={newChat?.agents ?? []}
        onClose={() => setNewChat(null)}
        onLaunch={launch}
      />
    </View>
  )
}
