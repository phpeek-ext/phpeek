<p align="center">
  <img src="store/icon-512.png" width="128" alt="PHPeek">
</p>

<h1 align="center">PHPeek</h1>
<p align="center"><b>Peek before you trust.</b><br>
One glance tells you if a site runs a PHP version exposed to PHP2Shell.</p>

---

Millions of WordPress, Magento, Drupal and Joomla sites sit on top of PHP. In October 2026, **PHP2Shell** (CVE-2026-109618 / CVE-2026-109619) showed that a single request can take over a server running an unpatched PHP — no login, no plugin bug needed.

You can't see which PHP a site runs. **PHPeek can.** It reads the headers your browser already received and puts a badge on its icon:

| Badge | What it means |
|---|---|
| 🔴 **!** | **Likely exposed.** The site shows a PHP version older than the fix — or PHP 8.1 and below, which never got one. |
| 🟢 **OK** | **All good.** The PHP version on display is patched. |
| 🟠 **?** | **Runs PHP, keeps its version secret.** WordPress / Magento / PHP spotted, version hidden. |
| *(nothing)* | **No PHP in sight.** |

Click the icon for the details.

## 100% passive. Zero data.

- **No requests.** PHPeek never contacts the sites you visit, and there's no PHPeek server to phone home to.
- **No tracking.** Results live in your browser for the open tab and vanish when you close it.
- **No poking.** It doesn't test or exploit anything. It only reads headers (`X-Powered-By`, `Server`, `Set-Cookie`, `Link`) and a couple of HTML markers.
- **Nothing to hide.** Under 200 lines of plain JavaScript. Read it.

See [PRIVACY.md](PRIVACY.md).

## The fine print

- **Most well-run sites hide their PHP version.** You'll see 🟠 a lot. That's good security, not a red flag.
- **🔴 is a strong hint, not proof.** Debian, Ubuntu, RHEL and friends backport fixes without bumping the version number.
- **It can't tell if a site was already hacked.** Patching closes the door; it doesn't evict anyone who got in first.
- **Tabs restored at browser start-up** may need a reload before PHPeek can peek.

## The fix, if you run a PHP site

| Branch | Patched in |
|---|---|
| 8.5 | **8.5.12** |
| 8.4 | **8.4.27** |
| 8.3 | **8.3.36** |
| 8.2 | **8.2.35** |
| 8.1 and older | no official fix — upgrade |

Updated? Now rotate your passwords, database credentials and API keys: PHP2Shell can leak memory contents. Hiding your version (`expose_php = Off`) is good hygiene, but it **does not** fix anything.

## Install

**Stores:** Chrome Web Store · Firefox Add-ons *(links coming soon)*

**Manual (Chrome / Brave / Edge / Opera):**
1. Grab `phpeek-chrome.zip` from [Releases](../../releases) and unzip it.
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Turn on **Developer mode** → **Load unpacked** → pick the folder.

## Build it yourself

```sh
python3 build.py            # → dist/phpeek-chrome.zip, dist/phpeek-firefox.zip
node tests/unit.test.js     # version + header logic
python3 tests/e2e.py        # loads the extension in Chromium against fake sites (needs Playwright)
```

Code lives in `src/`. `build.py` adds the browser-specific manifest bits.

## License

MIT. Fork it, ship it, make the web safer.
