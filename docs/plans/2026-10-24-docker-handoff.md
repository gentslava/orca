# Wave 2 Docker self-host packaging handoff

The production packaging uses the existing Node-only `build:orcad` bundle and provider harnesses. No Electron/Xvfb runtime, source-control staging, commits, branch changes, production restarts, real accounts, remote deployment, or registry publication were performed.

## Files owned by this worker

- `config/docker/orcad/Dockerfile`: Linux amd64/arm64 multi-stage source build; existing glibc 2.28 native builders; verified pinned Node; Debian runtime; nonroot UID/GID 1000; tiny init, explicit bind/port, health and shutdown.
- `config/docker/orcad/Dockerfile.dockerignore`: source allowlist, excluding host dependencies, build outputs, Git metadata and environment files.
- `config/docker/orcad/compose.yaml`: independent home/state/workspace volumes, host-loopback publication by default, configurable private pairing endpoint, restart policy and 60-second shutdown grace.
- `config/docker/orcad/README.md`: tracked deployment, pairing, provider authentication/versioning, persistent roots, updates, backup/restore and fixture commands.
- `config/docker/orcad/{configure,source-metadata,build-support,entrypoint,healthcheck,install-providers}.mjs`: metadata generation, bundle support, persistent machine identity, existing server launch/signal forwarding, original encrypted RPC/daemon health checks, official CLI installation/provenance.
- `config/docker/orcad/{smoke,fixture-client,fixture-state}.mjs`: isolated real Docker lifecycle/persistence acceptance, using the existing client, journal and credential sealing code without provider prompts.
- `config/scripts/build-orcad.mjs`: packaging commit lookup now accepts a validated archive revision via the new helper.
- `config/scripts/orcad-entry-build.mjs` and `src/shared/orcad-artifacts.ts`: package the existing usage scan worker beside the existing foreign SQLite/worker-child entries and include it in deploy completeness/content-version hashing.
- `config/scripts/orcad-source-commit.mjs` and its `.test.mjs`: optional `ORCAD_SOURCE_COMMIT`, preserving ordinary checkout lookup; six metadata-validation tests.

`config/docker/orcad/README.md` and all code/config paths are eligible for normal tracking. This handoff is ignored by `docs/**` and needs explicit `git add -f docs/plans/2026-10-24-docker-handoff.md` if the coordinator wants it committed; `.gitignore` was not modified. All worker changes remain unstaged/uncommitted.

## Persistence and provider boundary

`ORCA_USER_DATA=/var/lib/orca` alone does not retain the existing credential files. Compose also persists the complete service home, including `~/.orca` sealing records and provider/CLI/XDG homes, and `/workspaces`. A unique machine-id is generated in the state volume once and linked from `/etc/machine-id`; no host home or machine-id is mounted. Actual sealed-placeholder decryption is tested after replacement, including unchanged machine identity.

Claude uses official `@anthropic-ai/claude-code@2.1.310`. Its installed executable resolves through Orca's existing `resolveStructuredAgentCommand` and the SDK's existing executable path contract; login shells find the same CLI through standard `/usr/local/bin` links. Official Codex/Gemini packages can be pinned with `ORCAD_CODEX_VERSION` / `ORCAD_GEMINI_CLI_VERSION`; there is no new Gemini structured adapter or custom inference/authentication flow. Compose version keys are deliberately ORCAD-prefixed to avoid ambient agent variables selecting extra CLIs. The image manifest records exact package versions, executable paths/hashes and `--version` output.

## Verification

- First action: read-only `docker info`, existing Docker Desktop Linux context, native arm64; no context switch.
- `ORCA_BACKGROUND_LAUNCH=1 node node_modules/vitest/vitest.mjs run --config config/vitest.config.ts config/scripts/orcad-source-commit.test.mjs config/scripts/orcad-entry-build.test.mjs config/scripts/orcad-artifact-version.test.mjs src/shared/orcad-artifacts.test.ts`: 82 passed (4 files).
- `pnpm exec oxlint config/docker/orcad/*.mjs config/scripts/orcad-source-commit.mjs config/scripts/orcad-source-commit.test.mjs`: passed.
- `pnpm exec oxfmt --check` on all worker scripts, Compose, README and modified build script: passed.
- `docker compose --env-file /tmp/orcad-docker-wave2-usage.env -f config/docker/orcad/compose.yaml config --quiet`: valid.
- Real Docker builds passed the original mobile bundle checks, native glibc floor, existing Node-only bundle/import/provider/worker smoke checks and official CLI `--version` checks.
- `.bench-fixtures/orcad-fixture-bc89a8e1bc/report.json`: final fixture passed original encrypted client pairing/reconnect, restart, container replacement, workspace/real-journal/host-sealed-placeholder persistence and unchanged machine identity; existing command resolver and login shell both resolved original Claude Code 2.1.310. Deliberately suspending the terminal daemon produced health exit 1 with `terminal daemon self-test: unreachable (pty-spawn)`; recovery, final exit zero, no OOM kill, and cleanup of its own containers/volumes all passed.
- Authenticated `usage.setEnabled` / `usage.refresh` / `usage.getSnapshot` scanned a synthetic transcript with no credentials: 1,200 total tokens, 100 new input, 900 cache read, 200 output, 150 reasoning, and USD 0.003475 API-equivalent estimate. After restart and replacement, reads before refresh retained the same row and scan-completion timestamp. Existing foreign SQLite worker smoke passed during image build.

The final local arm64 image is `orca/orcad:1.4.214-0f91578a9e85-9766b4717bf9`, ID `sha256:217fcb812245c3d063dc9c8d5beec194b5affbea86b2de546cb6f3fac5fb38e3`. Its bundle version is `0.1.0+efd881c4805e`, base source revision is `0f91578a9e857fbb7b933fdf101d0c0907000750`, and dirty status is true. The configured source fingerprint is `9766b4717bf94700b7e1771056f46f75201cdfb18c9665a7619611aae5c098f6`; the actual copied-source fingerprint is `2b7609013ad88518e372aab69f02149339e56a535b0998959098f62120747e2e`. The shared source checkout changed between configuration and build; the metadata records both fingerprints explicitly and the image ID/bundle version identify the exact artifact. No clean-commit claim is made.

## Working commands

From a source checkout with Node 24 and existing repository dependencies / built process-host package:

```sh
node config/docker/orcad/configure.mjs
docker compose --env-file config/docker/orcad/.env -p orcad -f config/docker/orcad/compose.yaml build
docker compose --env-file config/docker/orcad/.env -p orcad -f config/docker/orcad/compose.yaml up -d --no-build --wait --wait-timeout 180
docker compose --env-file config/docker/orcad/.env -p orcad -f config/docker/orcad/compose.yaml logs --tail 100 orcad
```

Paste `pairing.url` into Settings → Remote Orca Servers → Add server → Paste access link. Set a private host publication/pairing address in the generated `.env` for remote clients, or use an SSH forward. Provider authentication is an explicit interactive operation by the server owner, such as `docker compose --env-file config/docker/orcad/.env -p orcad -f config/docker/orcad/compose.yaml exec orcad claude auth login`.

Before updating, stop and back up the three volumes consistently using the README's streaming tar commands. Generate new source/image metadata with `configure.mjs --output /tmp/orcad-next.env`, preserve deployment address/provider choices in its existing `.env`, then run `build` followed by `up -d --no-build --force-recreate --wait`. Keep the same Compose project name and volumes. Container replacement terminates running processes; durable history/workspaces and supported provider resume state remain.

The isolated acceptance command is `ORCA_BACKGROUND_LAUNCH=1 node config/docker/orcad/smoke.mjs --env-file /tmp/orcad-docker-wave2-usage.env`. It creates and cleans only its random fixture project/volumes, never mounting user HOME or using accounts. Detailed logs are `/tmp/orcad-docker-wave2-usage-build.log` and `/tmp/orcad-docker-wave2-usage-smoke.log`; reports intentionally exclude pairing tokens and sealing keys. Tests/apps used Node 24 via `/Users/gentslava/.nvm/versions/node/v24.22.0/bin` and `ORCA_BACKGROUND_LAUNCH=1`; no shared dependency reinstall or desktop/CLI output rebuild occurred.

## Limits

Native Docker acceptance ran on Linux arm64 through Docker Desktop. The amd64 build path reuses the repository's pinned native-builder image but was not executed here; no Windows/macOS host deployment or real provider-authenticated inference was attempted. Mixed-version protocol/capability negotiation is unchanged; the fixture exercises the real same-source RPC client rather than a desktop UI. This image has no GUI display/system browser, and operations needing additional browser/desktop dependencies remain unavailable as negotiated by the existing runtime. No GHCR image was published.
