# Store listing copy

Copy-paste into the store forms.

---

## Chrome Web Store (also covers Brave, Opera, Vivaldi)

**Name:** PHPeek — Instant PHP2Shell Check

**Summary** (max 132 chars):
> Peek before you trust. One glance tells you if a site runs a PHP version exposed to PHP2Shell. Zero data collected.

**Category:** Developer Tools
**Language:** English

**Description:**
```
Peek before you trust.

Millions of WordPress, Magento, Drupal and Joomla sites run on PHP. PHP2Shell (CVE-2026-109618 / CVE-2026-109619) showed that one request can take over a server running unpatched PHP — no login, no plugin bug needed.

You can't see which PHP a site runs. PHPeek can.

ONE GLANCE, THREE ANSWERS
🔴 "!" — Likely exposed. The site shows a PHP version older than the fix, or PHP 8.1 and below (never patched).
🟢 "OK" — All good. The PHP version on display is patched.
🟠 "?" — Runs PHP, keeps its version secret. WordPress, Magento or PHP spotted, version hidden.
Click the icon for the details.

100% PASSIVE. ZERO DATA.
• No requests — never contacts the sites you visit. There's no PHPeek server to phone home to.
• No tracking — results stay in your browser and vanish when you close the tab.
• No poking — doesn't test or exploit anything. It just reads headers.
• Nothing to hide — open source, under 200 lines of JavaScript.

THE FINE PRINT
• Most well-run sites hide their PHP version, so you'll see "?" a lot. That's good security.
• "!" is a strong hint, not proof: some Linux distros patch without bumping the version number.
• PHPeek can't tell if a site was already hacked.

Run a PHP site? Patched releases: 8.5.12, 8.4.27, 8.3.36, 8.2.35.
```

**Screenshots (1280×800):** `store/screenshots/store-1-exposed.png` … `store-4-patched.png`
**Small promo tile (440×280):** `store/promo-small-440x280.png`
**Marquee (1400×560, optional):** `store/promo-marquee-1400x560.png`
**Store icon (128×128):** `src/icons/icon-128.png`

### Privacy practices tab

**Single purpose:**
> Show whether the site in the current tab advertises a PHP version exposed to the PHP2Shell vulnerability.

**Permission justifications:**
- **webRequest:** Read the HTTP response headers (X-Powered-By, Server, Set-Cookie, Link) of the page the user opens, to detect the PHP version. Read-only; no requests are blocked, modified or made.
- **Host permission (<all_urls>):** The user can open any website, and the check has to run on whichever site they open. Headers are read locally and never sent anywhere.
- **tabs:** Match the result to the current tab so the badge and popup show the right site.
- **storage:** Keep the per-tab result in session storage while the tab is open. Cleared on tab close.

**Remote code:** No, I am not using remote code.

**Data usage:** tick **nothing** in the "collects" list, then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://github.com/<your-username>/phpeek/blob/main/PRIVACY.md`

---

## Firefox Add-ons (addons.mozilla.org)

**Name:** PHPeek — Instant PHP2Shell Check
**Add-on URL slug:** phpeek
**Summary** (max 250 chars):
> Peek before you trust. One glance tells you if the site you're on runs a PHP version exposed to PHP2Shell (CVE-2026-109618 / CVE-2026-109619). 100% passive: no requests, no tracking, no data. Open source.

**Description:** same as Chrome above.
**Categories:** Privacy & Security; Web Development
**License:** MIT
**Privacy policy:** paste the contents of `PRIVACY.md`
**Homepage:** your GitHub repo URL

**Notes to reviewer:**
> Passive header check. background.js reads response headers via webRequest (read-only) and stores the result per tab in storage.session. content.js reads a few HTML markers (meta generator, wp-content / Magento script paths). No network requests, no remote code, no data collection. Plain JS, nothing minified or bundled.

---

## Launch post (Reddit / X / Mastodon / Hacker News)

**Short (X / Bluesky / Mastodon):**
> PHP2Shell is everywhere, and you can't see which sites are still running unpatched PHP.
> So I built PHPeek 👀 — a free browser extension that peeks at the PHP version any site advertises and flags the exposed ones. 100% passive, zero data, open source.
> Chrome: <link> · Firefox: <link>

**Longer (r/PHP, r/Wordpress, r/Magento, r/netsec, Hacker News "Show HN"):**
> **Show HN: PHPeek – see at a glance if a site runs PHP exposed to PHP2Shell**
>
> With PHP2Shell (CVE-2026-109618/109619) hitting everything from WordPress to Magento, I wanted a quick way to tell whether the site I'm on is still advertising a vulnerable PHP version.
>
> PHPeek reads the response headers your browser already got (X-Powered-By, Server…) and badges the icon: red if the version is below the fix, green if patched, orange if the site runs PHP but hides its version.
>
> It's fully passive — no requests, no telemetry, nothing leaves your browser. Under 200 lines of plain JS, MIT-licensed: <github link>
>
> Caveats: most well-configured sites hide their version (good!), and distros backport fixes without bumping version numbers, so red means "go check", not "definitely vulnerable".
>
> Feedback welcome.
