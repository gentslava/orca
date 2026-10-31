# Reviewed integration corrections for the personal build

These corrections belong to `gentslava/orca`. They reconcile the selected feature combination while keeping upstream feature PRs separate. Each entry is admitted only when the conflicted path and all three Git blob identities match. Both the patch and the resolved file have checked SHA-256 digests. New or changed conflict inputs stop publication.

The application source bundle contains the resolved files. The build plan names every applied correction and its digest. Translation catalogs use the separate strict key merge; these records do not silently choose a side for new conflicts.

## With stablyai/orca#33383

Combine desktop durable conversation projection with mobile selected-session reads; retain host-qualified reopening and both keyboard paths.

| File                                                                                    | Reviewed correction                                                               |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/main/ai-vault/structured-conversation-navigation.test.ts`                          | [Diff](conversation-navigation/structured-conversation-navigation.test.ts.patch)  |
| `src/main/ai-vault/structured-conversation-navigation.ts`                               | [Diff](conversation-navigation/structured-conversation-navigation.ts.patch)       |
| `src/main/runtime/rpc/methods/ai-vault.ts`                                              | [Diff](conversation-navigation/ai-vault.ts.patch)                                 |
| `src/renderer/src/components/right-sidebar/AiVaultSessionVirtualList.keyboard.test.tsx` | [Diff](conversation-navigation/AiVaultSessionVirtualList.keyboard.test.tsx.patch) |
| `src/renderer/src/components/right-sidebar/ai-vault-session-resume-here.ts`             | [Diff](conversation-navigation/ai-vault-session-resume-here.ts.patch)             |
| `src/shared/ai-vault-types.ts`                                                          | [Diff](conversation-navigation/ai-vault-types.ts.patch)                           |
| `src/shared/project-conversation-list.ts`                                               | [Diff](conversation-navigation/project-conversation-list.ts.patch)                |
| `src/shared/protocol-version.ts`                                                        | [Diff](conversation-navigation/protocol-version.ts.patch)                         |
| `src/shared/rpc-contract/ai-vault-params.ts`                                            | [Diff](conversation-navigation/ai-vault-params.ts.patch)                          |

## With stablyai/orca#33395

Combine Default model reset fencing with future-turn model/effort/Fast choices and immediate-versus-queued delivery capability checks.

| File                                                                                   | Reviewed correction                                                                     |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `mobile/src/session/mobile-native-chat-controller-contract.ts`                         | [Diff](session-default-and-queue/mobile-native-chat-controller-contract.ts.patch)       |
| `mobile/src/session/mobile-structured-agent-session-host-support.ts`                   | [Diff](session-default-and-queue/mobile-structured-agent-session-host-support.ts.patch) |
| `mobile/src/session/native-chat/input/native-chat-session-option-copy.ts`              | [Diff](session-default-and-queue/native-chat-session-option-copy.ts.patch)              |
| `src/renderer/src/components/native-chat/NativeChatSessionOptionPickers.test.tsx`      | [Diff](session-default-and-queue/NativeChatSessionOptionPickers.test.tsx.patch)         |
| `src/renderer/src/components/native-chat/use-structured-agent-session-options.ts`      | [Diff](session-default-and-queue/use-structured-agent-session-options.ts.patch)         |
| `src/renderer/src/components/native-chat/use-structured-agent-session-send-options.ts` | [Diff](session-default-and-queue/use-structured-agent-session-send-options.ts.patch)    |
| `src/renderer/src/components/native-chat/use-structured-agent-session-sends.ts`        | [Diff](session-default-and-queue/use-structured-agent-session-sends.ts.patch)           |

## With stablyai/orca#33403

Wrap typed orchestration mail without exposing grouped approval review content outside the tool disclosure; retain both regression suites.

| File                                                                                  | Reviewed correction                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `mobile/src/session/native-chat/transcript/MobileNativeChatMessage.tsx`               | [Diff](orchestration-mail-and-review/MobileNativeChatMessage.tsx.patch)               |
| `mobile/src/session/native-chat/transcript/MobileNativeChatMessage.work-run.test.tsx` | [Diff](orchestration-mail-and-review/MobileNativeChatMessage.work-run.test.tsx.patch) |

## With stablyai/orca#33502

Keep conversation visibility/preferences alongside personal project openings/pins across persistence, mobile schemas, RPC methods and WSL ownership dispositions.

| File                                                                        | Reviewed correction                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `mobile/src/host-screen/host-screen-operations.ts`                          | [Diff](project-preferences/host-screen-operations.ts.patch)                           |
| `mobile/src/host-screen/host-screen-reply-schema.ts`                        | [Diff](project-preferences/host-screen-reply-schema.ts.patch)                         |
| `mobile/src/host-screen/use-host-screen-controller.ts`                      | [Diff](project-preferences/use-host-screen-controller.ts.patch)                       |
| `mobile/src/worktree/workspace-view-settings.ts`                            | [Diff](project-preferences/workspace-view-settings.ts.patch)                          |
| `src/main/persistence/applying-settings/ui-state-read.ts`                   | [Diff](project-preferences/ui-state-read.ts.patch)                                    |
| `src/main/persistence/applying-settings/ui-state-update.ts`                 | [Diff](project-preferences/ui-state-update.ts.patch)                                  |
| `src/main/runtime/rpc/methods/client-ui.ts`                                 | [Diff](project-preferences/client-ui.ts.patch)                                        |
| `src/main/runtime/rpc/methods/ui-state-schema-parity-checks.ts`             | [Diff](project-preferences/ui-state-schema-parity-checks.ts.patch)                    |
| `src/main/runtime/runtime-rpc/runtime-rpc-mobile-paired-desktop-methods.ts` | [Diff](project-preferences/runtime-rpc-mobile-paired-desktop-methods.ts.patch)        |
| `src/renderer/src/lib/worktree-activation-structured-chat-surface.test.ts`  | [Diff](project-preferences/worktree-activation-structured-chat-surface.test.ts.patch) |
| `src/shared/persisted-ui-state-types.ts`                                    | [Diff](project-preferences/persisted-ui-state-types.ts.patch)                         |
| `src/shared/protocol-version.ts`                                            | [Diff](project-preferences/protocol-version.ts.patch)                                 |
| `src/shared/wsl-move/wsl-move-ui-dispositions.ts`                           | [Diff](project-preferences/wsl-move-ui-dispositions.ts.patch)                         |

## With stablyai/orca#33512

Retain both independent global settings contracts: saved worker roles and hold-to-quit policy.

| File                                 | Reviewed correction                                             |
| ------------------------------------ | --------------------------------------------------------------- |
| `src/shared/global-settings-base.ts` | [Diff](global-settings-contracts/global-settings-base.ts.patch) |

## With stablyai/orca#34866

Keep one picker fixture import and adapt the future-turn effort regression to the selected slider UI.

| File                                                                              | Reviewed correction                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/renderer/src/components/native-chat/NativeChatSessionOptionPickers.test.tsx` | [Diff](effort-picker-tests/NativeChatSessionOptionPickers.test.tsx.patch) |

## With stablyai/orca#36558

Advertise emulator recency/runtime support together with conversation navigation and personal project capabilities.

| File                             | Reviewed correction                                    |
| -------------------------------- | ------------------------------------------------------ |
| `src/shared/protocol-version.ts` | [Diff](runtime-capabilities/protocol-version.ts.patch) |
