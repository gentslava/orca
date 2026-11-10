import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isDirectInvocation } from './tool-invocation/script-entry-detection.mjs'

const desktop = [
  'config/scripts/fork-upstream-sync.test.mjs',
  'config/scripts/fork-upstream-archives.test.mjs',
  'src/main/gemini/gemini-acp-launch.test.ts',
  'src/main/gemini/gemini-acp-permissions.test.ts',
  'src/main/gemini/gemini-acp-resume.test.ts',
  'src/main/gemini/gemini-acp-session.test.ts',
  'src/main/native-chat/agent-session-wire/structured-agent-session-model-default.test.ts',
  'src/main/runtime/rpc/methods/structured-sessions/catalog/structured-agent-session-options-read.test.ts',
  'src/main/codex/structured/turns/codex-structured-message-options.test.ts',
  'src/shared/agent-session/options/structured-agent-session-option-view.test.ts',
  'src/main/ai-vault/structured-conversation-navigation.test.ts',
  'src/main/ai-vault/structured-session-ownership.test.ts',
  'src/main/ai-vault/session-list-results.test.ts',
  'src/main/ai-vault/session-list-result-validation.test.ts',
  'src/main/runtime/rpc/methods/history/ai-vault.test.ts',
  'config/scripts/mobile-web-app/mobile-web-app-project-conversations-render.test.mjs',
  'src/renderer/src/lib/activate-ai-vault-structured-session-reveal.test.ts',
  'src/renderer/src/lib/activate-ai-vault-structured-session-host.test.ts',
  'src/renderer/src/components/right-sidebar/right-sidebar-titlebar-drag-regions.render.test.tsx',
  'src/renderer/src/components/native-chat/native-chat-child-navigation.test.tsx',
  'src/renderer/src/components/native-chat',
  'src/renderer/src/components/native-chat/NativeChatMessageRow.work-run.test.tsx',
  'src/renderer/src/components/native-chat/usage/NativeChatNoticeRow.test.tsx',
  'src/shared/native-chat/native-chat-work-run.test.ts',
  'src/renderer/src/components/native-chat/messages/rows/NativeChatMessageRow.test.tsx',
  'src/renderer/src/components/native-chat/viewport/rail/NativeChatMessageRail.test.tsx',
  'src/renderer/src/components/native-chat/viewport/rail/native-chat-rail-outline-parity.test.ts',
  'src/renderer/src/components/native-chat/viewport/rail/use-structured-agent-session-rail-outline.test.tsx',
  'src/renderer/src/components/native-chat/viewport/virtualization/native-chat-row-height-estimate.test.ts',
  'src/main/native-chat/agent-session-wire/publication/history/testing/agent-session-conversation-outline.test.ts',
  'src/shared/agent-session/agent-session-message-source.test.ts',
  'src/renderer/src/components/native-chat/viewport/navigation/NativeChatMessageList.rail-history-jump.test.tsx',
  'src/renderer/src/components/native-chat/session/options/structured/use-structured-agent-session-options.test.tsx',
  'src/renderer/src/components/native-chat/use-structured-agent-session-model-default.test.tsx',
  'src/renderer/src/components/native-chat/attachments/chips/native-chat-image-references.test.tsx',
  'src/renderer/src/components/native-chat/queue/editing/native-chat-queued-edit-draft.test.ts',
  'src/renderer/src/components/native-chat/native-chat-composer-draft-recovery.test.ts',
  'src/renderer/src/components/native-chat/native-chat-composer-draft-storage.test.ts',
  'src/renderer/src/components/native-chat/drafts/native-chat-composer-draft-store.test.ts',
  'src/renderer/src/components/native-chat/drafts/native-chat-composer-draft-lifecycle.test.tsx',
  'src/renderer/src/components/native-chat/drafts/native-chat-composer-draft-addition.test.ts',
  'src/renderer/src/components/native-chat/drafts/native-chat-composer-draft-indexeddb.test.ts',
  'src/renderer/src/components/native-chat/attachments/intake/native-chat-composer-drop-scope.test.tsx',
  'src/renderer/src/components/native-chat/attachments/intake/native-chat-composer-workspace-file-drop.test.tsx',
  'src/renderer/src/components/native-chat/attachments/chips/use-native-chat-composer-attachments.test.tsx',
  'src/renderer/src/components/native-chat/attachments/chips/use-native-chat-composer-preview-lifetime.test.tsx',
  'src/renderer/src/components/native-chat/paste/use-native-chat-composer-paste.test.tsx',
  'src/renderer/src/components/native-chat/composer/editor/native-chat-composer-composition.test.tsx',
  'src/renderer/src/components/native-chat/composer/submit/use-native-chat-structured-composer-send.test.tsx',
  'src/renderer/src/components/native-chat/composer/submit/native-chat-structured-send-composition-clear.test.tsx',
  'src/main/claude/structured/claude-structured-dispatch-content.test.ts',
  'src/renderer/src/components/native-chat/queue/editing/use-structured-agent-session-queued-edit.test.tsx',
  'src/renderer/src/components/native-chat/use-structured-agent-session-queue-working.test.tsx',
  'src/main/native-chat/agent-session-wire/host/testing/structured-agent-session-goal-steering.test.ts',
  'src/main/native-chat/agent-session-wire/host/testing/structured-agent-session-queued-move.test.ts',
  'src/shared/orchestration-worker-roles.test.ts',
  'src/cli/handlers/orchestration-worker-role-cli.test.ts',
  'src/main/runtime/rpc/methods/orchestration/worker/worker-role-routing.test.ts',
  'src/main/usage/usage-account-attribution.test.ts',
  'src/main/usage/usage-history-projection.test.ts',
  'src/main/claude-usage/claude-usage-report-aggregation.test.ts',
  'src/main/runtime/rpc/methods/usage-history.test.ts',
  'src/renderer/src/components/stats/StatsPane.usage.test.tsx',
  'src/renderer/src/components/stats/UsageAccountQuotas.test.tsx',
  'src/renderer/src/components/stats/usage-overview-model.test.ts',
  'src/renderer/src/components/stats/usage-history-model.test.ts',
  'src/renderer/src/components/stats/usage-history-chart-model.test.ts',
  'src/renderer/src/components/stats/UsageHistoryDetails.test.tsx',
  'src/renderer/src/components/stats/use-usage-history.test.ts',
  'src/renderer/src/components/status-bar/use-owner-usage-rate-limits.test.tsx',
  'src/main/updater.fork-preview.test.ts',
  'src/main/updater/updater.build-channel-selection.test.ts',
  'src/main/updater/updater.quit-and-install.test.ts',
  'src/main/updater/updater.headless-serve-install.test.ts',
  'src/main/persistence/applying-settings/persistence-personal-project-order.test.ts',
  'src/main/runtime/rpc/methods/client-ui-project-order.test.ts',
  'src/renderer/src/components/sidebar/worktree-list-groups-personal-project-order.test.ts',
  'src/renderer/src/lib/worktree-activation-personal-project-order.test.ts',
  'src/renderer/src/runtime/personal-project-order-client.test.ts',
  'src/shared/project-preference-identity.test.ts',
  'src/shared/project-section-order.test.ts',
  'config/scripts/hold-quit-native.test.mjs',
  'src/main/window/hold-quit-gesture.test.ts',
  'src/main/window/desktop-hold-quit.test.ts',
  'src/main/window/macos-quit-chord-watch.test.ts',
  'src/shared/hold-quit-activity.test.ts',
  'src/renderer/src/app-shell/use-hold-quit-activity.test.tsx',
  'src/renderer/src/components/HoldQuitNotice.test.tsx',
  'src/main/menu/app-menu-hold-quit.test.ts',
  'src/main/persistence/applying-settings/persistence-settings-ui-defaults.test.ts',
  'src/main/updater/mac-install/updater-mac-quit-guard.test.ts',
  'src/main/startup/main-process-quit-update-veto.test.ts',
  'src/main/startup/serve-native-quit-guard.test.ts',
  'src/main/startup/main-window-actions-quit-and-stop-all-sessions.test.ts',
  'src/renderer/src/store/slices/settings/settings.test.ts',
  'src/renderer/src/store/slices/hold-quit-settings-owner.test.ts',
  'src/main/browser/guest-lifecycle/popups/presentation/browser-popup-native-window.test.ts',
  'src/main/codex-usage/scanner.test.ts',
  'src/main/codex-usage/store-persistence.test.ts'
]
const mobile = [
  'src/session/native-chat/visual/MobileNativeChatImageAttachment.test.tsx',
  'src/session/native-chat/mobile-native-chat-reading-place.test.tsx',
  'src/host-screen/project-conversations.test.ts',
  'src/host-screen/use-project-conversations.test.tsx',
  'src/host-screen/use-conversation-actions.test.tsx',
  'src/host-screen/conversation-open.test.ts',
  'src/session/native-chat/input/MobileNativeChatSessionOptionPickers.test.ts',
  'src/session/use-mobile-structured-agent-options.test.ts',
  'src/session/use-mobile-structured-native-chat-send-bridge.test.ts',
  'src/session/native-chat/transcript/MobileNativeChatRowOverlaysHost.test.tsx',
  'src/host-screen/personal-project-order.test.tsx',
  'src/worktree/personal-project-opening.test.ts',
  'src/worktree/personal-project-route-intent.test.ts'
]

export function runForkRegressions(root = process.cwd()) {
  for (const file of [...desktop, ...mobile.map((file) => join('mobile', file))]) {
    if (!existsSync(join(root, file))) {
      throw new Error(`Required fork regression suite disappeared: ${file}`)
    }
  }
  const env = { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' }
  for (const [script, ...args] of [
    ['plugin-authoring/rpc-catalog/generate-rpc-params-catalog.mjs', '--check'],
    ['localization/catalog-validation/verify-localization-catalogs.mjs'],
    ['localization/source-extraction/verify-localization-extraction.mjs'],
    ['localization/source-extraction/audit-localization-coverage.mjs', '--check']
  ]) {
    execFileSync(process.execPath, [resolve(root, 'config/scripts', script), ...args], {
      cwd: root,
      env,
      stdio: 'inherit'
    })
  }
  execFileSync(
    process.execPath,
    [
      resolve(root, 'config/scripts/test-runtime/execution-policy/run-vitest.mjs'),
      'run',
      '--config',
      'config/vitest.config.ts',
      ...desktop,
      '--maxWorkers=2'
    ],
    { cwd: root, env, stdio: 'inherit' }
  )
  execFileSync(
    process.execPath,
    [resolve(root, 'mobile/node_modules/vitest/vitest.mjs'), 'run', ...mobile, '--maxWorkers=2'],
    { cwd: resolve(root, 'mobile'), env, stdio: 'inherit' }
  )
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  runForkRegressions()
}
