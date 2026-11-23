import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isDirectInvocation } from './tool-invocation/script-entry-detection.mjs'

const desktop = [
  'src/shared/agent-session/journal/agent-message-link-provenance.test.ts',
  'src/main/runtime/agent-session/structured-child-retention-lifecycle.test.ts',
  'src/renderer/src/components/workspace-start/workspace-startup-explicit-actions.test.tsx',
  'src/main/claude-usage/transcript-file-discovery-errors.test.ts',
  'config/scripts/fork-upstream-sync.test.mjs',
  'config/scripts/fork-upstream-archives.test.mjs',
  'src/main/acp/acp-dialects/gemini-dialect.test.ts',
  'src/main/gemini/gemini-acp-launch-spec.test.ts',
  'src/main/native-chat/agent-session-wire/options/structured-agent-session-model-default.test.ts',
  'src/main/codex/structured/turns/codex-structured-message-options.test.ts',
  'src/shared/agent-session/options/view/structured-agent-session-option-view.test.ts',
  'src/main/ai-vault/structured-conversation-navigation.test.ts',
  'src/main/ai-vault/listing/session-list-results.test.ts',
  'src/main/runtime/rpc/methods/history/ai-vault.test.ts',
  'config/scripts/mobile-web-app/mobile-web-app-project-conversations-render.test.mjs',
  'src/renderer/src/components/native-chat/native-chat-child-navigation.test.tsx',
  'src/renderer/src/components/native-chat',
  'src/renderer/src/components/native-chat/NativeChatMessageRow.work-run.test.tsx',
  'src/renderer/src/components/native-chat/usage/NativeChatNoticeRow.test.tsx',
  'src/renderer/src/components/native-chat/session/options/structured/use-structured-agent-session-model-default.test.tsx',
  'src/renderer/src/components/native-chat/native-chat-composer-draft-recovery.test.ts',
  'src/renderer/src/components/native-chat/native-chat-composer-draft-storage.test.ts',
  'src/renderer/src/components/native-chat/drafts/native-chat-composer-draft-store.test.ts',
  'src/renderer/src/components/native-chat/drafts/native-chat-composer-draft-lifecycle.test.tsx',
  'src/renderer/src/components/native-chat/drafts/native-chat-composer-draft-addition.test.ts',
  'src/renderer/src/components/native-chat/attachments/intake/native-chat-composer-drop-scope.test.tsx',
  'src/renderer/src/components/native-chat/attachments/chips/use-native-chat-composer-attachments.test.tsx',
  'src/renderer/src/components/native-chat/composer/editor/native-chat-composer-composition.test.tsx',
  'src/renderer/src/components/native-chat/queue/editing/use-structured-agent-session-queued-edit.test.tsx',
  'src/renderer/src/components/native-chat/use-structured-agent-session-queue-working.test.tsx',
  'src/main/native-chat/agent-session-wire/host/testing/structured-agent-session-goal-steering.test.ts',
  'src/main/native-chat/agent-session-wire/host/testing/structured-agent-session-queued-move.test.ts',
  'src/shared/native-chat/transcript/folding/native-chat-turn-fold.test.ts',
  'src/shared/orchestration-worker-roles.test.ts',
  'src/cli/orchestration/workers/worker-role-cli.test.ts',
  'src/main/runtime/rpc/methods/orchestration/worker/worker-role-routing.test.ts',
  'src/main/usage/usage-account-attribution.test.ts',
  'src/main/usage/usage-history-projection.test.ts',
  'src/main/claude-usage/claude-usage-report-aggregation.test.ts',
  'src/main/runtime/rpc/methods/usage-history.test.ts',
  'src/renderer/src/components/stats/StatsPane.usage.test.tsx',
  'src/renderer/src/components/stats/UsageAccountQuotas.test.tsx',
  'src/renderer/src/components/stats/usage-history-model.test.ts',
  'src/renderer/src/components/stats/usage-history-chart-model.test.ts',
  'src/renderer/src/components/stats/UsageHistoryDetails.test.tsx',
  'src/renderer/src/components/stats/use-usage-history.test.ts',
  'src/renderer/src/components/status-bar/usage/use-owner-usage-rate-limits.test.tsx',
  'src/main/updater.fork-preview.test.ts',
  'src/main/persistence/applying-settings/persistence-personal-project-order.test.ts',
  'src/main/runtime/rpc/methods/client-ui-project-order.test.ts',
  'src/renderer/src/components/sidebar/worktree-list-groups-personal-project-order.test.ts',
  'src/renderer/src/lib/worktree-activation-personal-project-order.test.ts',
  'src/renderer/src/runtime/personal-project-order-client.test.ts',
  'src/shared/project-preference-identity.test.ts',
  'src/shared/sidebar-list/sections/project-section-order.test.ts',
  'config/scripts/hold-quit-native.test.mjs',
  'src/main/window/hold-quit-gesture.test.ts',
  'src/main/window/desktop-hold-quit.test.ts',
  'src/main/window/macos-quit-chord-watch.test.ts',
  'src/shared/hold-quit-activity.test.ts',
  'src/renderer/src/app-shell/use-hold-quit-activity.test.tsx',
  'src/renderer/src/components/HoldQuitNotice.test.tsx',
  'src/main/menu/app-menu-hold-quit.test.ts',
  'src/main/updater/mac-install/updater-mac-quit-guard.test.ts',
  'src/renderer/src/store/slices/hold-quit-settings-owner.test.ts'
]
const mobile = [
  'src/session/native-chat/visual/MobileNativeChatImageAttachment.test.tsx',
  'src/host-screen/project-conversations.test.ts',
  'src/host-screen/use-project-conversations.test.tsx',
  'src/host-screen/use-conversation-actions.test.tsx',
  'src/host-screen/conversation-open.test.ts',
  'src/session/native-chat/input/session-options/MobileNativeChatSessionOptionPickers.test.ts',
  'src/session/native-chat/input/session-options/use-mobile-structured-agent-options.test.ts',
  'src/session/use-mobile-structured-model-default-send.test.tsx',
  'src/session/native-chat/transcript/turn-state/use-mobile-native-chat-turn-disclosure.reader-toggle.test.tsx',
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
