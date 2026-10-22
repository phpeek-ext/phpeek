# Store listing copy (v1.2.1)

Copy-paste into the store forms when you upload v1.2.

---

## Name
**PHPeek — Hacked-Site Shield (PHP2Shell, Card & Wallet)**

## Summary (Chrome max 132 chars)
> Flags PHP2Shell-exposed sites, blocks card skimmers, guards passwords, seed phrases, wallet signatures and clipboard. Zero data.

## Summary (Firefox max 250 chars)
> Peek before you trust. Flags sites exposed to PHP2Shell (CVE-2026-109618/109619), blocks card skimmers on hacked stores, and guards your passwords, seed phrase, wallet signatures and clipboard on every site. No tracking, zero data, open source.

## Description
```
Peek before you trust.

PHP2Shell (CVE-2026-109618 / CVE-2026-109619) lets attackers take over unpatched WordPress, Magento, Drupal and Joomla servers, and it's being exploited right now. A hacked site doesn't attack you directly: it hides a script that copies your card at checkout, leaks the password you just typed, or serves a fake "verify you're human" page, a seed-phrase form or a wallet drainer.

PHPeek watches for exactly that.

👀 PHP2SHELL CHECK
Open any site and the icon tells you:
🔴 "!" — The server advertises a PHP version affected by PHP2Shell. Avoid typing passwords or card details here.
🟠 "?" — Runs PHP, keeps its version secret.
No badge — no affected version advertised. That's what the server reports, not a guarantee.
"Tell the site owner" opens a ready-to-send email with the fix.

🔎 CHECK ANY SITE
Type a store's address in the popup and check it before you even open it.

💳 CARD GUARD — every site
Type your card number and PHPeek recognises it if a hidden script tries to send it anywhere other than the store or a payment provider (Stripe, PayPal, Adyen…). That's how card skimmers work. PHPeek blocks it and tells you where it was going.
On a 🔴 store, a heads-up at the card field: pay with PayPal, Apple Pay, Google Pay or a virtual card instead.

🔑 PASSWORD GUARD
On a 🔴 site, a heads-up before you type your password: the flaw can leak passwords from the server's memory.

🛡️ SEED SHIELD — every site
Paste or type a seed phrase into a website and PHPeek clears it and warns you.

✍️ WALLET SIGNATURE CHECK — every site
Unlimited token approvals, "approve ALL your NFTs", Permit/Permit2 gasless approvals, marketplace orders, delegations, blind signing: paused and explained in plain words before your wallet pops up.

📋 CLIPBOARD GUARD — every site
When a fake "I'm not a robot" page secretly puts a command in your clipboard (ClickFix), PHPeek swaps it for a harmless warning.

Warnings open in a PHPeek window, not on the page, so a hacked site can't hide or fake them.

NO TRACKING. ZERO DATA.
• No PHPeek server. No analytics. Nothing collected.
• Card numbers, seed words, passwords and clipboard text are checked on the spot and never stored or sent.
• The only time PHPeek contacts a site is when you use "Check any site", and then only that site.
• Open source, plain readable JavaScript.

HONEST LIMITS
PHPeek is a safety net, not a shield. Skimmers that encrypt the card or post it back to the hacked store itself can get through, and it can't remove malware already on your computer. Prefer PayPal / Apple Pay / Google Pay on unknown stores, use unique passwords and 2FA.

Run a PHP site? Patched releases: 8.5.12, 8.4.27, 8.3.36, 8.2.35.
```

## Screenshots
Existing `store/screenshots/store-*.png` still work. Announcement images in `store/announce-v11/`.

---

## Chrome: "Privacy practices" tab (v1.2)

**Single purpose:**
> Warn and protect the user on the website they are visiting against risks from compromised sites: PHP2Shell-exposed servers and the attacks such sites serve (card skimmers, password exposure, seed-phrase phishing, wallet-drainer signatures, ClickFix clipboard commands).

**webRequest justification:**
> Read the HTTP response headers (X-Powered-By, Server, Set-Cookie, Link) of the page the user opens, to detect the PHP version. Read-only; no requests are blocked or modified through webRequest.

**Host permission justification:**
> The check and the guards must run on whichever site the user opens. Content scripts check, locally: (1) whether a card number the user typed is being sent by a page script to a third-party site that isn't a payment provider (anti-skimmer), (2) card/password fields on PHP2Shell-exposed sites (heads-up), (3) text typed/pasted for seed phrases, (4) wallet requests (EIP-1193) for risky approvals/signatures, (5) clipboard writes for ClickFix commands. Host access is also used for "Check any site": when the user types an address in the popup, the extension loads that single page without cookies to read its headers. Nothing is stored or transmitted to us or anyone else.

**storage justification:**
> Keep the per-tab PHP2Shell verdict and "already warned on this site" flags in session storage while the tab is open. Cleared on tab close.

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing; tick the three certifications.

**Privacy policy URL:** `https://github.com/phpeek-ext/phpeek/blob/main/PRIVACY.md`

## Firefox: notes to reviewer (v1.2)
> v1.2 adds Card Guard, Password Guard and "Check any site". src/cards.js (isolated world, pure: Luhn + card brand check, payment-provider allowlist, skimmer decision). src/inpage.js (MAIN world) gains wrappers on fetch/XHR/sendBeacon/WebSocket/URL setters/form submit/window.open that stay dormant until a card number is typed, then ask the isolated world whether a request carries that number to a non-payment third party; such requests are dropped. Card numbers live only in page memory. "Check any site" (popup) makes one user-initiated fetch with credentials omitted to the address the user typed. No remote code, no data collection, nothing minified. Tests: tests/*.js, tests/e2e_cards.py, tests/e2e_guards.py.

---

## Launch post for v1.1 (X)

**Thread:**
> 1/ PHPeek v1.1 is out 👀
>
> v1 told you if a site runs PHP exposed to PHP2Shell. but the real danger is what a hacked site serves YOU. so v1.1 guards that, on every site:
>
> 2/ 🛡️ Seed Shield: paste or type a seed phrase into a website → cleared + warned. nobody legit ever asks for it
>
> ✍️ wallet signature check: unlimited approvals, setApprovalForAll, Permit/Permit2, blind signing get paused and explained before your wallet pops up
>
> 3/ 📋 Clipboard Guard: a "verify you're human" page sneaks a command into your clipboard → swapped for a harmless warning
>
> 📨 "tell the owner" button on exposed sites
>
> 4/ took the feedback seriously: had an independent review try to break it, fixed every bypass it found (incl. pages that override JS built-ins), 38 real-browser attack tests
>
> still 100% local, zero data, open source. it's a safety net, not a shield 🫡
> github.com/phpeek-ext/phpeek
