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

<!-- shared: resolver -->

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

<!-- shared: no-guessing -->
