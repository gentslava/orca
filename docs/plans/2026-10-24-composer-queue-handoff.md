# Composer and queue implementation handoff

Task `task_0dc41f6b4466`, Dispatch `ctx_bc1983422f49`, on `feat/conversation-first-ade`.

Implemented the approved composer/queue/settings/runtime-capability scope without staging, committing, switching branches, or launching the production app.

## Delivered behavior

- A busy structured chat queues complete text/image drafts on Enter when the queue preference and host support permit it. Cmd on macOS or Ctrl elsewhere plus Enter steers that complete draft through the original provider harness once; Shift+Enter stays a newline, IME confirmation stays local, and held Enter does not repeat sends.
- Idle Cmd/Ctrl+Enter retains ordinary send behavior. Busy touch users can Queue or Send, choose Send now with current turn from Draft actions, and stop the running turn independently.
- Settings and their search/palette targets remain discoverable on unsupported and unconfirmed hosts. The preference is disabled with visible update/checking copy; the composer states the actual Enter delivery.
- The existing integrated Codex steering/stop/settlement matrix passed before `agent-session.queued-messages.v1` was advertised. The new additive `agent-session.steer-draft.v1` gates the strict `steer: true` send field, which is fingerprinted with the operation and cannot be combined with queue delivery.
- Explicit steering captures the running turn's immutable accepted choices from the host journal. It preserves future selections and previously captured queue choices. A host unable to identify that running snapshot refuses the steer with the existing localized turn-active reason instead of silently queueing it.
- Busy model, effort and Fast/speed controls are labelled Next turn. Hosts without send-option snapshots keep these writes disabled while busy and explain the required update. Codex execution-option differences, including Fast/service tier, wait for a future turn.
- Queue cards retain existing send-now/edit/delete actions and add Move earlier / Move later. The capability-gated `agentSession.queuedMessageMove` reuses journal `moved` rows and durable operation receipts; repeated replies cannot undo later reorders. Bodies, image references, identities, pauses, and captured options survive reorder/edit/host restart.
- Folder identities, paired-host routing, mixed-version gates, and original provider adapters are preserved; no custom inference loop or separate queue store was introduced.

## Verification

All commands used Node 24.22.0 via `PATH=/Users/gentslava/.nvm/versions/node/v24.22.0/bin:$PATH` and `ORCA_BACKGROUND_LAUNCH=1`.

- Combined focused suite: **30 files, 484 tests passed**, 2026-10-24 22:56:42 local start, 15.96 seconds.
- After the final idle-shortcut and pending-turn capability guard adjustments, the keyboard/queue-controller/option-controller follow-up passed **3 files, 67 tests** at 22:58:12.
- `rtk proxy env PATH=/Users/gentslava/.nvm/versions/node/v24.22.0/bin:$PATH ORCA_BACKGROUND_LAUNCH=1 pnpm tc:web`: passed.
- `rtk proxy env PATH=/Users/gentslava/.nvm/versions/node/v24.22.0/bin:$PATH ORCA_BACKGROUND_LAUNCH=1 pnpm tc:node`: passed.
- `pnpm exec oxlint` over the explicit owned-file allowlist below: passed, including the existing line limits.
- `pnpm exec oxfmt --write` over owned source/test files and `pnpm generate:rpc-params-catalog`: completed.
- `git diff --check -- <owned allowlist>`: passed.
- Global `pnpm run check:code-quality:changed` at 22:55 found **zero owned-file findings**, but failed with 13 findings in other owners' statistics/sidebar/rendered-fixture files. Exact paths and categories were sent to the coordinator; that integration gate must be rerun after their fixes.
- No rendered Electron instance was started by this worker. The named electron skill was absent from the available/local skill directories; the coordinator owns hidden Electron/CDP integration evidence, including queue light/dark/narrow coverage.

The combined suite command was:

```sh
rtk proxy env PATH=/Users/gentslava/.nvm/versions/node/v24.22.0/bin:$PATH ORCA_BACKGROUND_LAUNCH=1 pnpm test \
  src/main/native-chat/agent-session-wire/structured-agent-session-steer-draft.test.ts \
  src/main/native-chat/agent-session-wire/structured-agent-session-queued-move.test.ts \
  src/main/runtime/rpc/methods/structured-agent-session-queued-edit.test.ts \
  src/main/runtime/structured-agent-session-codex-turn-end-settlement.test.ts \
  src/renderer/src/components/settings/ChatBehaviorSetting.test.tsx \
  src/renderer/src/components/native-chat/NativeChatComposerActions.test.tsx \
  src/renderer/src/components/native-chat/NativeChatComposerDelivery.test.tsx \
  src/renderer/src/components/native-chat/NativeChatQueuedMessageList.test.tsx \
  src/renderer/src/components/native-chat/NativeChatSessionOptionPickers.test.tsx \
  src/renderer/src/components/native-chat/use-native-chat-composer-keydown.steer.test.tsx \
  src/renderer/src/components/native-chat/use-native-chat-structured-composer-send.test.tsx \
  src/renderer/src/components/native-chat/use-structured-agent-session-sends.test.tsx \
  src/renderer/src/components/native-chat/use-structured-agent-session-options.test.tsx \
  src/renderer/src/components/native-chat/NativeChatQueuedMessageList.inline-edit.test.tsx \
  src/main/codex/codex-structured-turn-steer.test.ts \
  src/main/native-chat/agent-session-wire/structured-agent-session-queued-messages.test.ts \
  src/main/native-chat/agent-session-wire/structured-agent-session-message-choices.test.ts \
  src/main/native-chat/agent-session-wire/structured-agent-session-send-options.test.ts \
  src/main/runtime/rpc/methods/structured-agent-session-wire-contracts.test.ts \
  src/renderer/src/runtime/structured-agent-session-host-capability.test.tsx \
  src/renderer/src/components/settings/ChatSettingsSection.test.tsx \
  src/renderer/src/components/native-chat/use-native-chat-composer-keydown.test.tsx \
  src/renderer/src/components/native-chat/use-native-chat-composer-submit.test.tsx \
  src/renderer/src/components/native-chat/NativeChatQueuedMessageEditor.test.tsx \
  src/renderer/src/components/native-chat/NativeChatQueuedMessageList.in-flight.test.tsx \
  src/renderer/src/components/native-chat/use-structured-agent-session-queued-messages.test.tsx \
  src/renderer/src/components/native-chat/use-structured-agent-session-queued-messages.resume.test.tsx \
  src/renderer/src/components/native-chat/use-structured-agent-session-queued-edit.test.tsx \
  src/renderer/src/components/native-chat/use-structured-agent-session.queued-gating.test.tsx \
  src/renderer/src/components/native-chat/use-structured-agent-session-send-options.test.tsx
```

## Localization handoff

All new renderer copy calls the existing translation function with English fallback. Add/review these new keys through the locale owner's extraction workflow:

- `components.settings.nativeChat.queueFollowUpsChecking`
- `components.settings.nativeChat.queueFollowUpsUnsupported`
- `components.native-chat.composer.futureMessageOptions`
- `components.native-chat.composer.steerUnavailable`
- `components.native-chat.composer.sendingDraft`
- `components.native-chat.composer.queueChecking`
- `components.native-chat.composer.queueUnsupported`
- `components.native-chat.composer.enterQueues`
- `components.native-chat.composer.enterSendsNow`
- `components.native-chat.composer.steerCurrentTurn`
- `components.native-chat.composer.steerRequiresUpdate`
- `components.native-chat.composer.queueDraft`
- `components.native-chat.composer.sendDraft`
- `components.native-chat.composer.draftActions`
- `components.native-chat.composer.steerDraft`
- `components.native-chat.composer.futureOptionsRequireUpdate`
- `components.native-chat.composer.nextTurn`
- `components.native-chat.composer.nextTurnOptionsLabel`
- `components.native-chat.queuedMessages.moveEarlier`
- `components.native-chat.queuedMessages.moveLater`

The existing `components.settings.nativeChat.queueFollowUpsCopy` now describes queued text and images plus edit/delete/reorder and the alternate-send shortcut; its old image exception must be replaced in translated catalogs.

## Owned changed files

The following explicit allowlist excludes unrelated owners' changes:

- `src/main/native-chat/agent-session-journal/command-receipt-schema.ts`
- `src/main/native-chat/agent-session-journal/journal-queued-messages.ts`
- `src/main/native-chat/agent-session-journal/queued-message-move.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-execution-options.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-host-mutations.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-host.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-message-options.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-mutation-plans.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-queued-move.test.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-queued-move.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-queued-wiring.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-steer-draft.test.ts`
- `src/main/native-chat/agent-session-wire/structured-agent-session-turns.ts`
- `src/main/runtime/rpc/methods/structured-agent-session-queued-edit.test.ts`
- `src/main/runtime/rpc/methods/structured-agent-session-queued-methods.ts`
- `src/main/runtime/rpc/methods/structured-agent-session-schemas.ts`
- `src/main/runtime/structured-agent-session-codex-turn-end-settlement.test.ts`
- `src/renderer/src/components/native-chat/NativeChatComposer.tsx`
- `src/renderer/src/components/native-chat/NativeChatComposerActions.test.tsx`
- `src/renderer/src/components/native-chat/NativeChatComposerActions.tsx`
- `src/renderer/src/components/native-chat/NativeChatComposerDelivery.test.tsx`
- `src/renderer/src/components/native-chat/NativeChatComposerDelivery.tsx`
- `src/renderer/src/components/native-chat/NativeChatComposerField.tsx`
- `src/renderer/src/components/native-chat/NativeChatQueuedMessageCard.tsx`
- `src/renderer/src/components/native-chat/NativeChatQueuedMessageList.inline-edit.test.tsx`
- `src/renderer/src/components/native-chat/NativeChatQueuedMessageList.tsx`
- `src/renderer/src/components/native-chat/NativeChatQueuedMessageMenu.tsx`
- `src/renderer/src/components/native-chat/NativeChatSessionOptionPickers.test.tsx`
- `src/renderer/src/components/native-chat/NativeChatSessionOptionPickers.tsx`
- `src/renderer/src/components/native-chat/native-chat-composer-types.ts`
- `src/renderer/src/components/native-chat/native-chat-session-option-labels.ts`
- `src/renderer/src/components/native-chat/native-chat-structured-composer-dispatch.ts`
- `src/renderer/src/components/native-chat/structured-agent-session-pending-sends.ts`
- `src/renderer/src/components/native-chat/structured-agent-session-send-attempt.ts`
- `src/renderer/src/components/native-chat/structured-agent-session-send-slot.ts`
- `src/renderer/src/components/native-chat/use-native-chat-composer-keydown.steer.test.tsx`
- `src/renderer/src/components/native-chat/use-native-chat-composer-keydown.ts`
- `src/renderer/src/components/native-chat/use-native-chat-composer-submit.ts`
- `src/renderer/src/components/native-chat/use-native-chat-structured-composer-send.test.tsx`
- `src/renderer/src/components/native-chat/use-native-chat-structured-composer-send.ts`
- `src/renderer/src/components/native-chat/use-native-chat-structured-composer-transport.ts`
- `src/renderer/src/components/native-chat/use-structured-agent-session-options.test.tsx`
- `src/renderer/src/components/native-chat/use-structured-agent-session-options.ts`
- `src/renderer/src/components/native-chat/use-structured-agent-session-queued-messages.ts`
- `src/renderer/src/components/native-chat/use-structured-agent-session-sends.test.tsx`
- `src/renderer/src/components/native-chat/use-structured-agent-session-sends.ts`
- `src/renderer/src/components/native-chat/use-structured-agent-session.ts`
- `src/renderer/src/components/settings/ChatBehaviorSetting.test.tsx`
- `src/renderer/src/components/settings/ChatBehaviorSetting.tsx`
- `src/renderer/src/components/settings/ChatSettingsSection.test.tsx`
- `src/renderer/src/components/settings/chat-behavior-search.ts`
- `src/renderer/src/hooks/settings-navigation-interface-sections.ts`
- `src/renderer/src/runtime/structured-agent-session-host-capability.ts`
- `src/shared/agent-session-queued-message-wire.ts`
- `src/shared/agent-session-runtime-capabilities.ts`
- `src/shared/native-chat-session-options.ts`
- `src/shared/rpc-contract/rpc-params-catalog.generated.ts`
- `src/shared/rpc-contract/structured-agent-session-params.ts`
- `src/shared/rpc-contract/structured-agent-session-queued-edit-params.ts`
- `src/shared/structured-agent-session-send-mutation.ts`

This report is also new: `docs/plans/2026-10-24-composer-queue-handoff.md`.

## Integration remaining

Root owns final locale extraction/review, the hidden rendered queue scenario, whole-branch quality/build checks, and staging/commit/push decisions. This worker has made no commit and no push.
