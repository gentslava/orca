`antigravity-v1.4.3-options.json` records metadata-only responses from Google's
unmodified Antigravity ACP 1.4.3 macOS arm64 runtime, using `clientInfo.name=orca`.
The archive is the official ACP registry release, SHA-256
`c57db0a9b8b712daa9c3c17cdb990a61842ea569f279e8bd79d7aa85a303b20b`.

The process used a disposable `GEMINI_HOME`, file storage, and a deliberately
invalid fixture API key. It sent initialize, authenticate, session/new, and
session/set_config_option only; it generated no model turns. This exercises the
server's built-in API-key catalog, not a signed-in account's live entitlement.
Only the session ID was anonymized. The named updates set Flash to Low, switch
to Pro (retaining Low), set High, and select an older concrete Medium model ID.

The server owns grouping and effort resolution. Orca uses its model config
values and thought_level choices unchanged. OAuth catalogs remain account and
client scoped: this release allows third-party models only for its explicitly
recognized client surfaces; Orca is not on that allowlist. The original `agy`
CLI `/model` remains the supported route for the CLI's broader inventory.
