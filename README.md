# Mobile history insertion during a touch gesture

Synthetic English rows rendered with the production MobileNativeChatPageList, production row keys and tail-follow hook in hidden Chromium at 390 x 780 CSS pixels. The normal history callback returns 40 older rows after 500 ms during a 500 px touch gesture. No injected scroll offsets or provider sessions.

Before: upstream-merged PR head 726566ab5d3c8c6b030f36833cf7e3046a231441; final offset -6804 px, maximum single observed scroll step 6405 px.

After: bec8b9a480b; final offset -380 px, maximum single observed step 11 px. Both reach scrollHeight 13727 px; loaded history remains available.

Screenshots show a raw production list fixture, not the complete application shell. This proves the browser gesture regression; installed-app and physical-device acceptance remain separate.
