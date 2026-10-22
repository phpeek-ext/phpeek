# PHPeek Privacy Policy

*Last updated: October 2026 (v1.2)*

**Short version: PHPeek collects nothing. Ever.**

- PHPeek does not collect, store, transmit, sell or share any personal or browsing data.
- PHPeek never contacts analytics services or any server run by its authors — there isn't one.
- The only network request PHPeek ever makes is when **you** type an address into **Check any site**: it loads that one page (following any redirect it answers with), without cookies, to read its headers. Nothing about it is kept or sent anywhere else.
- Everything happens inside your browser, on the tab you're looking at. PHPeek never scans, crawls or lists websites.

## What PHPeek looks at, and what happens to it

| What | Why | What happens to it |
|---|---|---|
| HTTP response headers of the page you open (`X-Powered-By`, `Server`, `Set-Cookie`, `Link`) and a few HTML markers | Spot PHP versions exposed to PHP2Shell | A verdict (exposed / patched / hidden) is kept in session memory for that tab and deleted when the tab closes |
| Text you paste or type into page fields | Seed Shield: spot seed phrases | Checked on the spot against the BIP39 word list. Never stored, never sent. If a seed is detected, the field is cleared; the words stay in memory only until you answer the warning, so they can be restored if it was a false alarm |
| Wallet requests a page makes (method and parameters, e.g. an approval) | Wallet signature check | Classified on the spot. Only a short code (e.g. "unlimited approval") and the contract/spender addresses are passed to PHPeek's own warning window. Never stored, never sent. PHPeek never sees keys and never signs anything |
| Numbers you type into page fields | Card Guard: recognise your card number if a script tries to send it away | Only a number that passes the card checksum is kept, in that page's memory, until you leave the page. Never stored, never sent. Outgoing requests from the page are checked against it on the spot |
| Whether a field you click is a card or password field | Card/Password Guard heads-up on PHP2Shell-exposed sites | A "warned on this site" flag in session memory for that tab, deleted when the tab closes |
| An address you type into **Check any site** | Check that site for PHP2Shell | That page is loaded once, without cookies; its headers and HTML markers are read for a verdict shown in the popup, then discarded |
| Text a page writes to your clipboard | Clipboard Guard: spot ClickFix commands | Checked on the spot. Never stored, never sent |

No cookies, no trackers, no ads, no third-party code, no remote code.

## Permissions

| Permission | Used for |
|---|---|
| `webRequest` + access to all sites | Reading response headers of the page you open (read-only — nothing is blocked, changed or sent), running the guards on whichever site you visit, and loading the one page you ask for in **Check any site**. |
| `storage` | Keeping the per-tab PHP2Shell verdict (and "already warned" flags) in session memory while the tab is open. |

Questions? Open an issue on the GitHub repository.
