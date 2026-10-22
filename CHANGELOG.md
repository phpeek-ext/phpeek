# Changelog

## 1.2.1
- **Honest verdicts:** no more green "OK". A patched-looking server now reads "No affected PHP version advertised — what the server reports, not a guarantee", with no badge. Red verdicts read "advertises an affected version". (Thanks for the feedback on X.)
- **Clear name:** "PHPeek — Hacked-Site Shield (PHP2Shell, Card & Wallet)", so the name says everything the extension does.
- **Welcome page** on install (and when updating from 1.0/1.1): every protection, what it can see, what it never does, honest limits. Also linked from the popup.

## 1.2.0
- **Card Guard — anti-skimmer:** after you type a real card number (Luhn + card brand), any script that tries to send it to a site that's neither the store nor a known payment provider is blocked: `fetch`, `XMLHttpRequest`, `sendBeacon`, WebSocket, image/script/iframe/link URLs, `setAttribute`, `form.submit()` and normal form posts, `window.open`. Catches plain, URL-encoded, base64 and reversed numbers. One warning window per page naming the destination. Dormant until a card is typed; wrappers stay patchable so Sentry/Zone.js-style libraries keep working.
- **Card Guard — heads-up on exposed stores:** reach the card field on a PHP2Shell-exposed store and PHPeek suggests a safer way to pay. Once per site per tab.
- **Password Guard:** on a PHP2Shell-exposed site, a heads-up at the password field (memory leak risk): unique password + 2FA. Once per site per tab.
- **Check any site:** type an address in the popup to check it before opening it. Loads that single page without cookies; the only network request PHPeek makes.
- **Hardened after an independent review:** blocked requests fail like a network error (no hanging checkouts); a normal "Pay" form posting to an unknown site asks instead of silently failing; arming only from card fields (or a strict brand match elsewhere), so gift cards and barcodes don't count; ~150 more payment gateways + country domains; base64 in URL paths, stray-prefix and double base64, last-digit-dropped numbers; same-origin iframes share protection; HTML injection, `WebSocket`/`EventSource`, Blob bodies covered; `<input name="action">` can't hide a form's real target; about:blank/srcdoc frames recognised as the store; a page can't make PHPeek pop windows by faking input; heads-ups capped per tab and don't swallow the skimmer warning; prototype wrappers only installed once a card is typed; softer, hedged wording.

## 1.1.0
- **Seed Shield:** detects BIP39 seed phrases pasted (12+ words) or typed (6+ words; 3 in seed-looking fields; 12 in password fields) into any site, including word-per-box forms, open shadow DOM and contenteditable. Clears them and warns; restore option for false alarms. Search boxes skipped.
- **Wallet signature check:** pauses unlimited/limited `approve`, `increaseAllowance`, `setApprovalForAll`, Permit2 `approve`, EIP-2612 Permit and Permit2 typed data, Seaport/Blur orders, delegation typed data, `eth_sign`, `personal_sign` of a 32-byte hash, and inspects `wallet_sendCalls` batches. Any transaction on a PHP2Shell-exposed site gets a heads-up. Works with `window.ethereum` and EIP-6963 providers, including legacy `send`/`sendAsync` and batches.
- **Clipboard Guard:** swaps ClickFix commands written via `navigator.clipboard`, `DataTransfer.setData` or the hidden-textarea `execCommand('copy')` trick for a harmless warning. Handles caret/backtick obfuscation. Install commands visible in a code block are allowed (unless the site is exposed).
- **Warnings in an extension window** the page can't hide or fake; all warning text comes from fixed templates in the background.
- **Hardened against hostile pages** (independent review): private DOM-element channel created before page scripts run; all decisions in the isolated world; in-page relay captures built-ins up front and avoids page-reachable prototypes; requests are snapshotted with `structuredClone` and the snapshot is what reaches the wallet; fail-closed when a request can't be verified; per-frame rate limit.
- **Popup:** shows the verdict, not the exact PHP version; **Tell the site owner** email; lists active guards.
- Removed the `tabs` permission.

## 1.0.0
- PHP2Shell check from response headers; WordPress/Magento hints; badge + popup.
