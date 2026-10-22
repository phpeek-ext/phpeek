# Store listing copy (v1.1)

Copy-paste into the store forms when you upload v1.1.

---

## Name
**PHPeek — PHP2Shell Check & Wallet Guard**

## Summary (Chrome max 132 chars)
> Flags sites exposed to PHP2Shell. Guards your seed phrase, wallet signatures and clipboard. 100% local, zero data.

## Summary (Firefox max 250 chars)
> Peek before you trust. Flags sites exposed to PHP2Shell (CVE-2026-109618/109619) and guards your seed phrase, wallet signatures and clipboard against drainers and ClickFix on every site. 100% local, zero data, open source.

## Description
```
Peek before you trust.

PHP2Shell (CVE-2026-109618 / CVE-2026-109619) let attackers take over millions of unpatched WordPress, Magento, Drupal and Joomla servers. A hacked site doesn't attack you directly: it serves you a fake "restore your wallet" form, a drainer that asks you to sign an approval, or a "verify you're human" page that puts a command in your clipboard.

PHPeek watches for exactly that.

👀 PHP2SHELL CHECK
Open any site and the icon tells you:
🔴 "!" — Likely exposed. Don't type passwords, cards or connect your wallet here.
🟢 "OK" — Patched.
🟠 "?" — Runs PHP, keeps its version secret.
One click on "Tell the site owner" opens a ready-to-send email with the fix.

🛡️ SEED SHIELD — every site
Paste or type a seed phrase into a website and PHPeek clears it and warns you. No real site, wallet or support team ever asks for it.

✍️ WALLET SIGNATURE CHECK — every site
Before your wallet pops up, PHPeek pauses what drainers use and explains it in plain words: unlimited token approvals, "approve ALL your NFTs", Permit/Permit2 gasless approvals, marketplace order signatures, delegations, blind signing. You decide: cancel or continue.

📋 CLIPBOARD GUARD — every site
When a site silently puts a command in your clipboard (the "ClickFix" trick), PHPeek swaps it for a harmless warning.

Warnings open in a PHPeek window, not on the page, so a hacked site can't hide or fake them.

100% LOCAL. ZERO DATA.
• No requests. No server. No tracking.
• Seed words, clipboard text and wallet requests are checked on the spot and never stored or sent.
• Only checks the tab you're on. Never scans or lists sites.
• Open source, plain readable JavaScript.

HONEST LIMITS
PHPeek is a safety net, not a shield. It can't remove malware already on your computer, can't stop plain transfers to a wrong address, and a kit built specifically to beat it may get through. Use a hardware wallet, read what your wallet shows, keep your browser updated.

Run a PHP site? Patched releases: 8.5.12, 8.4.27, 8.3.36, 8.2.35.
```

## Screenshots
Use the existing four in `store/screenshots/store-*.png`. Optional extra: `warn-approve.png`, `warn-seed.png` (crop to 1280×800 or 640×400 before uploading).

---

## Chrome: "Privacy practices" tab (v1.1)

**Single purpose:**
> Warn the user about risks on the website they are visiting: PHP2Shell-exposed servers and the attacks such compromised sites serve (seed-phrase phishing, wallet-drainer signatures, ClickFix clipboard commands).

**webRequest justification:**
> Read the HTTP response headers (X-Powered-By, Server, Set-Cookie, Link) of the page the user opens, to detect the PHP version. Read-only; no requests are blocked, modified or made.

**Host permission justification:**
> The check and the guards must run on whichever site the user opens. Content scripts check, locally, (1) text typed/pasted into page fields for seed phrases, (2) wallet requests the page makes (EIP-1193) for risky approvals/signatures, and (3) text the page writes to the clipboard for ClickFix commands. Nothing is stored or transmitted; risky actions open an extension window where the user decides.

**storage justification:**
> Keep the per-tab PHP2Shell verdict in session storage while the tab is open. Cleared on tab close.

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing; tick the three certifications.

**Privacy policy URL:** `https://github.com/phpeek-ext/phpeek/blob/main/PRIVACY.md`

(The `tabs` permission was removed in v1.1.)

## Firefox: notes to reviewer (v1.1)
> v1.1 adds local guards. Files: src/inpage.js (MAIN world, thin relay: captures built-ins at document_start, snapshots EIP-1193 requests and clipboard writes, decides nothing); src/rules.js + src/guard.js (isolated world: classification, seed-phrase detection with the bundled BIP39 English wordlist, private DOM-element channel to inpage.js); src/background.js (PHP2Shell header check, opens warning.html in a popup window, builds all warning text from fixed templates). No network requests, no remote code, no data collection, nothing minified. Tests: tests/*.js and tests/e2e_guards.py.

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
