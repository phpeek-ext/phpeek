# PHPeek Privacy Policy

*Last updated: October 2026 (v1.1)*

**Short version: PHPeek collects nothing. Ever.**

- PHPeek does not collect, store, transmit, sell or share any personal or browsing data.
- PHPeek makes no network requests. It never contacts the sites you visit, analytics services, or any server run by its authors — there isn't one.
- Everything happens inside your browser, on the tab you're looking at. PHPeek never scans, crawls or lists websites.

## What PHPeek looks at, and what happens to it

| What | Why | What happens to it |
|---|---|---|
| HTTP response headers of the page you open (`X-Powered-By`, `Server`, `Set-Cookie`, `Link`) and a few HTML markers | Spot PHP versions exposed to PHP2Shell | A verdict (exposed / patched / hidden) is kept in session memory for that tab and deleted when the tab closes |
| Text you paste or type into page fields | Seed Shield: spot seed phrases | Checked on the spot against the BIP39 word list. Never stored, never sent. If a seed is detected, the field is cleared; the words stay in memory only until you answer the warning, so they can be restored if it was a false alarm |
| Wallet requests a page makes (method and parameters, e.g. an approval) | Wallet signature check | Classified on the spot. Only a short code (e.g. "unlimited approval") and the contract/spender addresses are passed to PHPeek's own warning window. Never stored, never sent. PHPeek never sees keys and never signs anything |
| Text a page writes to your clipboard | Clipboard Guard: spot ClickFix commands | Checked on the spot. Never stored, never sent |

No cookies, no trackers, no ads, no third-party code, no remote code.

## Permissions

| Permission | Used for |
|---|---|
| `webRequest` + access to all sites | Reading response headers of the page you open (read-only — nothing is blocked, changed or sent), and running the guards on whichever site you visit. |
| `storage` | Keeping the per-tab PHP2Shell verdict in session memory while the tab is open. |

Questions? Open an issue on the GitHub repository.
