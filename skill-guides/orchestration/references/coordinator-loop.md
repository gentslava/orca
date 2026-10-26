# Coordinator loop

Load this reference for expanded DAG waves, per-invocation launch preferences,
same-terminal reuse, or review ownership. The compact guide remains the source
of truth for the loop order and completion boundary.

## Ready waves

Create independent Tasks before the first wait. Encode only real dependencies,
then use the ready view as external memory:

```text
ORCA orchestration task-create --spec "<dependent work>" --deps <json_array> --json
ORCA orchestration task-list --ready --brief --json
```

`--brief` collapses whitespace and caps echoed specs at 160 characters;
`spec_truncated` identifies shortened rows. Omit it when full specs are needed or
when an older CLI rejects the flag. A nested worker must respect
`nested_worker_depth_exceeded`; creating another Run does not reset depth.
Helpers a worker starts appear in this Run's `worker-list` with their
`creatorDispatchId`, and report to that worker rather than to you.

## Launch preferences

For a fresh Claude, Codex, Cursor, Antigravity, or Muse terminal, `--model`
accepts an opaque provider model ID. Pass it only when the user named a model;
otherwise omit it so the worker inherits the user's configured agent default.
Add `--effort` only when that model supports it:

```text
ORCA orchestration worker-start --task <task_id> --worktree current --agent claude --model opus --effort high --json
ORCA orchestration worker-start --task <task_id> --worktree current --agent muse --model muse-spark-1.3 --json
```

OpenCode also accepts `--model` in an existing worktree when the execution host
verifies its CLI version and model availability. Creating a new worktree with an
OpenCode model override is unsupported; use `--worktree current` or an existing
worktree selector, or omit `--model`. OpenCode effort is unsupported. Omit the
model to inherit its configuration; unsupported or unknown hosts refuse the
override explicitly.

`--effort` requires `--model`; neither option combines with `--terminal`. A
connected worker server must advertise launch-preference support before Orca
forwards either field. Compare `launch.requested` with `launch.effective`; never
claim a model or effort from requested arguments alone.

## Configured worker roles

When the user names a saved worker role, use `--role <name>` instead of guessing
an agent or model. The user configures profiles in Settings → Orchestration →
Worker roles on the Run home. Initial names are research, implementation, and
review; an unassigned or unknown role is refused before Task creation.

```text
ORCA orchestration worker-start --spec "<approved implementation>" --worktree current --role implementation --json
ORCA orchestration worker-start --spec "<independent review>" --worktree current --role review --json
```

Explicit `--model`, `--effort`, and `--fast on|off` replace profile values. An
explicit different `--agent` clears inherited model, effort, and Fast; repeat
the intended options for that provider. Roles never combine with `--terminal`.
Claude/Codex Fast requires the configured Chat UI route, an existing workspace,
and verified model/account catalog support; terminal Fast follows its launch
catalog. A refusal never authorizes a different harness, host, or provider.

Role/Fast launches require `orchestration.worker-role-routing.v1` on both hosts.
The execution server preflights the resolved choices before the Run home creates
a Task/Dispatch. A missing remote receipt after attachment is outcome unknown,
not permission to launch a duplicate. Read `launch.role` and `launch.effective`;
`effectiveSource: launch_configuration` describes emitted configuration, not a
promise about provider execution, cost, quota, or billing. Role choices do not
alter existing concurrency limits or trigger automatic retries.

## Reuse after settlement

Choose the terminal's next owner before acknowledging the Delivery. When the
same exact agent has immediate follow-up work, recover the proven handle and
transfer cleanup ownership to the new Dispatch:

```text
ORCA orchestration worker-show --dispatch <dispatch_id> --json
ORCA orchestration worker-start --task <next_task_id> --terminal <agent_terminal_handle> --json
```

Otherwise explicitly retain or release the settled worker. Do not leave it live
only to inspect output; archived output remains available through `worker-read`.

## Review ownership

A review-only `worker_done` authorizes synthesis of findings, not coordinator
file edits. Dispatch or hand off fixes unless the user explicitly assigned them
to the coordinator. If the user's plan names a next owner, post-review fixes and
PR preparation remain with that owner; the coordinator routes and synthesizes.
