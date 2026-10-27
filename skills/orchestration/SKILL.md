---
name: orchestration
description: >-
  Coordinate explicitly requested Orca workers across agents, workspaces or hosts,
  or work under a live Orca Task/Dispatch preamble (check, ask, worker_done).
  Use for Orca Runs, task DAGs, decision gates and durable worker ownership.
  For ordinary delegation within Codex or Claude, prefer that agent's native
  subagents. Use `orca-cli` for ownership handoffs and workspace/terminal control.
---

# Orca Orchestration

This file is a discovery stub, not the usage guide. The full, version-matched Orca
orchestration reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Use Orca orchestration for explicitly requested Orca workers, durable Runs/task DAGs,
cross-agent or cross-host coordination, and live Task/Dispatch worker obligations
(`check`, `ask`, `worker_done`). It starts independent agent chats or terminals.

For ordinary parallel delegation inside Codex or Claude, prefer that provider's native
subagents. Asking to delegate, monitor their progress or collect results alone does not
request Orca workers. If native subagents are unavailable, explain the independent-session
behavior before offering Orca workers. Preserve an existing Orca Run's lifecycle authority;
native subagents cannot replace its Dispatches or settle its workers.

Use `orca-cli` for ownership handoffs without Orca supervision, and for workspace,
terminal and built-in browser operations.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Orca exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise, on Linux outside an Orca-managed terminal, use `orca-ide`. Never run bare
  `orca` there — outside Orca's terminals it normally resolves to the
  GNOME Orca screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `orca`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Orca build.

## Load the version-matched guide before running Orca commands

```text
ORCA skills get orchestration
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the normal local coordinator loop and dispatched-worker
obligations. For a conditional action gate such as remote placement, uncertain release
recovery, or expanded DAG work, load only the reference that gate names with
`ORCA skills get orchestration --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get orchestration --full` and read the named bundled reference before acting.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ORCA open` or restart Orca. If
`skills get` is unknown, explain that updating Orca restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
