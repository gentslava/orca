# October 27 release reconstruction and related changes

Reporter confirmation: the latest published releases were installed on October 27. This reconstructs the release pair from that statement and GitHub publication times; it is not a contemporaneous device manifest.

| Component | Latest before the original October 27 report | Published (UTC) | Source |
| --- | --- | --- | --- |
| Android | [0.0.59](https://github.com/stablyai/orca/releases/tag/mobile-android-v0.0.59), code 23 | October 26 04:21:00 | bbaa33ce6536b8c117db522b11e983ebe8374da6 |
| Desktop | [1.4.242](https://github.com/stablyai/orca/releases/tag/v1.4.242) | October 27 00:09:03 | 86ad9d95cac792f3d1359d886cef9fb9b0aadd47 |

The original complaint was around October 27 16:00 +07, after both publications. Android .60 was published October 29 06:10:09 UTC; .61 on October 30 17:05:33 UTC. Most mobile UI is served by the desktop (explicitly stated in the .59 release notes), so testing only the old APK against a current desktop would not reconstruct the original stack.

Official archives were downloaded and SHA-256 verified:
- Android .59 APK: f8a18086b04dc00966431edc4d484132d6fc8dc08a5d88009a3246317a12f343.
- Desktop 1.4.242 arm64 mac zip: b2b1b0b2a7d955583cacb247154e8eb3844c026aba4fad07e6ee85a28b4e8ba1.

## Related changes after the original release

- [#32987](https://github.com/stablyai/orca/pull/32987), 8291297b0bad0167a65a3ac2f269b8be7cc7d581: recover the terminal input lease on attachment and preserve picked file names. This commit is absent from desktop 1.4.242 and listed in the later Android .60 notes. Relevant to terminal-backed attachment readiness, not proof of a native picker defect.
- [#34760](https://github.com/stablyai/orca/pull/34760), 4270c886d8a2094c50159ecae8e2f822d3c1231f: release/discard native picks arriving after page teardown, using a registry generation fence. Entered Android .60; absent from .59.
- [#34772](https://github.com/stablyai/orca/pull/34772), 72ff417691265664786bc2ff6c7f402350b1aaeb: remove owned cache copies when a Documents selection is refused for exceeding remaining capacity. Entered Android .60; absent from .59.
- [#33731](https://github.com/stablyai/orca/pull/33731) and [#34462](https://github.com/stablyai/orca/pull/34462): host-stored chat image presentation, relevant to seeing history images, not evidence of a Photos picker repair.
- [#34402](https://github.com/stablyai/orca/pull/34402) reorganized media/visual modules; no picker repair is inferred from that refactor.

The release/source audit identifies plausible affected paths, not the original cause. The diagnostics PR #34365 and focused repair PRs #36569/#36572/#36574 are separate open work; they must not be described as installed historical fixes.

## Historical error boundaries

At desktop 1.4.242, generic Attach failed covers picker/read, connection lookup and host image upload. Disconnected and permission cases have separate toast strings. The installed old stack visibly produced Attach failed (disconnected) after a photo was selected. That is not evidence that the original October 27 failure occurred before the picker.
