# Russian localization

Russian uses the built-in locale `ru`. The shared setting accepts `ru`; native and browser language detection recognizes regional and POSIX tags such as `ru-RU`, `ru-KZ` and `ru_RU.UTF-8`. Renderer catalogs load as retryable JSON assets, and native menus load the same catalog lazily. The existing `getIntlLocale()` path supplies `ru` to number, date, relative-time and weekday formatting. Browser preferences stay client-local when a paired server is older or offline.

The runtime catalog remains a sparse, nested i18next JSON file at `src/renderer/src/i18n/locales/ru.json`. A missing translation uses the current English fallback. Do not fill missing entries with English or present a sparse-catalog validation as proof of complete translation. The future PO authoring migration is described in [the translation-source decision](./i18n-translation-source.md); this change does not implement that migration.

## Translation workflow

One owner applies reviewed deltas to `ru.json`. Feature workers own inline English defaults, and the coordinator extracts `en.json` after integration. `sync:localization-catalog` adds missing IDs; an existing stable ID whose English wording changed still needs its source value reviewed and updated.

Generate an exact current inventory and separate source-bearing translation tasks:

```sh
rtk proxy env ORCA_BACKGROUND_LAUNCH=1 node config/scripts/russian-translation-progress.mjs --write-missing /private/tmp/orca-ru-translation
```

The inventory separates translated leaves, intentional unchanged native labels or interpolation-only values, unreviewed English copies, missing leaves, additional CLDR plural forms and unknown IDs. `--require-complete` fails for missing entries or unreviewed English copies. `--json` emits the exact ID lists. The five domain files are refreshed even when a domain is empty, so an old file cannot suggest obsolete work.

Assign disjoint source files to translators and ask them to return separate completed delta files. Remove entries that were not translated and reviewed. Never let multiple workers rewrite `ru.json` concurrently. The delta format is:

```json
{
  "ru": {
    "components.native-chat.composer.send": {
      "source": "Send",
      "translation": "Отправить"
    }
  }
}
```

Apply and validate a reviewed delta:

```sh
rtk proxy env ORCA_BACKGROUND_LAUNCH=1 node config/scripts/apply-translation-delta.mjs /path/to/reviewed.delta.json
rtk proxy env ORCA_BACKGROUND_LAUNCH=1 node config/scripts/verify-localization-catalog.mjs
rtk proxy env ORCA_BACKGROUND_LAUNCH=1 node config/scripts/russian-translation-progress.mjs
```

Russian deltas require an exact current English `source` snapshot. The importer rejects empty translations, changed placeholders, altered literal code, altered link destinations, lost markup and broken tag nesting. It keeps existing translations by default. An intentional correction must include `previousTranslation`; the importer replaces it only if the existing value still matches that reviewed snapshot. Writes use a temporary file and rename, and a rejected entry leaves that locale's file unchanged.

Translate complete phrases with their UI context. Preserve provider names, file paths, command syntax, interpolation variables and source text from providers. Original approval options and transcript prose remain the provider's own text; application labels such as cancellation and reasons are translated. Reuse a translation only after checking the English source and the target wording. A dictionary of whole, reviewed source phrases is suitable for repeated labels; word substitution is not.

## Plurals

i18next selects Russian `one`, `few`, `many` and `other` forms when a call supplies `count`. The catalog validator permits an additional locale-specific suffix only when the corresponding English `_other` family exists and the category belongs to that locale. It checks its placeholders against that English source. Unknown families and unsupported categories still fail validation.

Several legacy UI sites choose English singular/plural in JavaScript. For those sites, reviewed count-neutral Russian phrases such as `Изменено файлов: {{count}}` preserve grammatical correctness without changing unrelated component behavior. New count-based sites should pass `count` and provide all Russian forms. The queue image-count test exercises 0, 1, 2, 5, 11, 21, 22, 25 and 1.5 through the actual renderer backend.

[PR #12505](https://github.com/stablyai/orca/pull/12505) addresses synthetic resource IDs used by plugin language packs. Built-in `ru` already reaches `Intl.PluralRules` with a real locale tag, so that plugin-only wrapper is not needed for this locale. This work does not claim to fix plural selection for third-party plugin packs.

## Upstream assessment and completion checkpoint

The upstream material reviewed on 24 October 2026 was [PR #16736](https://github.com/stablyai/orca/pull/16736), head `c9e39872fad4692bb59a19b5d2c4e32e453a07da`. Its Russian file has 5,792 leaves against its 13,581-leaf English file. Against this checkout's initial 17,040 English leaves, 5,581 candidate IDs retain exactly the same English source, 25 are stale and 186 are retired; 245 of the current candidates are identical to English. None of those counts proves linguistic review.

Bulk import was rejected after inspecting actual translations. Examples included a stock-market definition for “Split Down”, `выходов` for “terminal”, `Штифт` for “Pin” and `Линейные проблемы` for “Linear issues”. Of the 564 browser/navigation/dashboard/tab candidates inspected in this pass, 560 were accepted, including 166 corrected entries. Four technical values were omitted. Menu/tray/language labels were reviewed separately. The core chat, usage and server additions were authored or reviewed against their actual current UI meaning.

The completed desktop catalog now covers every current source ID across daily chat, settings/onboarding/integrations, navigation/workspaces/runtime, editor/browser/source control, and automations/tasks/activity. The strict inventory on 25 October reported **17,494 English source leaves: 16,615 translated, 879 intentional original values, 146 additional Russian plural forms, zero missing entries, zero unreviewed English copies, and zero unknown IDs**. Re-run the inventory after adding source copy; these counts describe a source snapshot, rather than every possible third-party string.

Intentional original values are native language names, provider/product names, protocol identifiers, code, paths or interpolation-only values. Context-specific invariants in `config/localization-russian-invariants.json` include the exact English source and a review reason. A changed source invalidates that exemption. They must never be used to waive ordinary untranslated prose.

Translations were reviewed as complete phrases. The integration also replaced active English fragments and singular/plural concatenation in runtime notices, terminal drops, worker labels, workspace cleanup, clone progress, browser/editor flows and Git conflict guidance. Russian CLDR tests exercise whole messages rather than concatenated word substitutions. Technical source text from providers, user content, provider error descriptions and third-party plugin content retain their original language.

Standalone React Native mobile screens have their own copy and are not claimed as translated. The shared desktop renderer used by paired web clients uses this catalog. Browser preferences remain client-local when a server is older or offline. Files under `/private/tmp/orca-ru-translation/` contain the reviewed source snapshots and import deltas used during integration; the runtime catalog and source-bound invariants are the durable repository artifacts.

## Verification

Locale checks cover system detection; renderer/main lazy loading; actual i18next Russian CLDR selection; numbers, dates, weekdays and reset durations; translated chat/queue/permission controls; retained provider copy; paired-client preference persistence; guarded source changes; placeholders; code; and protected markup. Source grammar integration passed **381 tests in 37 files**, with **432 CLDR assertions across 48 count families**. Subsequent conflict-copy integration passed **27 tests in two files**. These are scoped runs with overlapping coverage, not a count of distinct tests for the entire branch.

The strict inventory passes `--require-complete`. The catalog validator confirms all 17,494 English source IDs have Russian values, plus 146 valid Russian-only plural forms. Runtime English extraction and source coverage pass separately; the coverage audit retains 14 reviewed baseline exclusions. Completeness measures catalog coverage; rendered checks separately verify navigation, compact activity, queue actions, usage, role settings and live locale changes.

The isolated hidden Electron E2E passed the actual Appearance language picker, persisted Russian choice, original provider transcript and editable Russian composer. The final full-app checkpoint ran **1 test in 5.4 seconds**. The rendered component fixture separately covers light/dark layouts, narrow viewports, live locale switching, model/effort/Fast controls, account quotas, history filters and role settings. The latest rendered component checkpoint is `.bench-fixtures/conversation-first-oBK11q/`; final source build and fixture paths are recorded in the implementation handoff.

The named `electron` skill is unavailable in this environment. Validation uses the repository's existing Playwright/Electron CDP harness with `ORCA_BACKGROUND_LAUNCH=1`, isolated profiles and hidden windows; it never uses computer-use, production profiles or OS activation.

After preparing the current E2E build and Electron ABI, run:

```sh
rtk proxy env PATH=/Users/gentslava/.nvm/versions/node/v24.22.0/bin:$PATH ORCA_BACKGROUND_LAUNCH=1 SKIP_BUILD=1 pnpm exec playwright test tests/e2e/russian-conversation-locale.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1
```

Run scoped locale tests without replacing the current native ABI:

```sh
rtk proxy env PATH=/Users/gentslava/.nvm/versions/node/v24.22.0/bin:$PATH ORCA_BACKGROUND_LAUNCH=1 node config/scripts/run-vitest.mjs run --config config/vitest.config.ts src/shared/ui-language.test.ts src/shared/ui-locale.test.ts src/renderer/src/i18n src/main/i18n src/renderer/src/web/web-preload-api-russian-language.test.ts config/scripts/verify-localization-catalog.test.mjs config/scripts/apply-translation-delta.test.mjs
```

A previous full E2E TypeScript-project run reported 252 diagnostics in other E2E/cloud/mobile sources; the new Russian spec had zero diagnostics in that run. This is **not** a passing full E2E-project typecheck. Keep that limitation distinct from passing Node/Web/CLI and mobile application typechecks. The captured output is `/private/tmp/orca-ru-e2e-typecheck.log`.
