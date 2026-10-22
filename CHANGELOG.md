# Changelog

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
