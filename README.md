<p align="center">
  <img src="store/icon-512.png" width="128" alt="PHPeek">
</p>

<h1 align="center">PHPeek</h1>
<p align="center"><b>Peek before you trust.</b><br>
Flags sites exposed to PHP2Shell, and guards your seed phrase, wallet signatures and clipboard on every site.</p>

---

Millions of WordPress, Magento, Drupal and Joomla sites sit on top of PHP. In October 2026, **PHP2Shell** (CVE-2026-109618 / CVE-2026-109619) showed that a single request can take over a server running an unpatched PHP — no login, no plugin bug needed.

A hacked site doesn't attack *you* directly. It serves you something: a fake "restore your wallet" form, a drainer that asks you to sign an approval, a "verify you're human" page that puts a command in your clipboard. PHPeek watches for exactly that.

## What it does

### 👀 PHP2Shell check (v1)
Reads the headers your browser already received and badges its icon:

| Badge | What it means |
|---|---|
| 🔴 **!** | **Likely exposed.** The site shows a PHP version older than the fix — or PHP 8.1 and below, which never got one. Don't type passwords, cards or connect your wallet here. |
| 🟢 **OK** | **All good.** The PHP version on display is patched. |
| 🟠 **?** | **Runs PHP, keeps its version secret.** |
| *(nothing)* | **No PHP in sight.** |

The popup shows the verdict, not the exact version number, and a **📨 Tell the site owner** button that opens a ready-to-send email with the fix.

### 🛡️ Seed Shield (v1.1, every site)
If a seed phrase (BIP39 recovery words) is pasted or typed into a website, PHPeek clears it and warns you. No real site, wallet or support team ever asks for it.

### ✍️ Wallet signature check (v1.1, every site)
Before your wallet pops up, PHPeek pauses the requests drainers use and explains them in plain words:
unlimited token approvals, `setApprovalForAll` (all your NFTs), Permit / Permit2 gasless approvals, Seaport/Blur marketplace orders, delegations, blind `eth_sign` and hash signing. On a 🔴 site, *every* transaction gets a heads-up. You decide: cancel (default) or continue.

### 📋 Clipboard Guard (v1.1, every site)
"ClickFix" pages trick you into pasting a command into Run/Terminal. When a site silently writes a command like that to your clipboard, PHPeek swaps it for a harmless warning. Install commands shown openly in a code block (rustup, scoop…) are left alone.

**Warnings open in a PHPeek window, not on the page**, so a hacked site can't hide or fake them.

## 100% local. Zero data.

- **No requests.** PHPeek never contacts the sites you visit, and there's no PHPeek server.
- **No tracking, no storage.** Results live in session memory for the open tab. Seed words and clipboard text are never stored or sent anywhere — not even to PHPeek's own background.
- **Only the tab you're on.** It never scans, crawls or lists sites.
- **Nothing to hide.** ~1,100 lines of plain, unminified, commented JavaScript. Read it.

See [PRIVACY.md](PRIVACY.md).

## Threat model — what it does and doesn't stop

PHPeek is **a safety net, not a shield.** Be clear-eyed about it:

**Stops (tested in real Chromium against hostile pages):**
- Generic phishing / drainer kits on hacked or fake sites: seed-phrase forms, approval/permit drainers, NFT `setApprovalForAll`, blind signing, ClickFix clipboard tricks (incl. hidden-textarea and obfuscated `p^o^w^e^r^s^h^e^l^l`).
- Pages that try to fight PHPeek: forging approval messages, faking PHPeek windows, deleting the guard, overriding JavaScript built-ins (`RegExp`, `String`, `Map`, `Promise`, `dispatchEvent`, `JSON`), prototype-call bypasses. Decisions are made in the extension's isolated world, which pages can't touch; when PHPeek can't verify a request, it cancels it.

**Doesn't stop:**
- **Malware already on your computer.** A browser extension can't see or fix that.
- **Keystrokes before detection.** A page's own key listeners see what you type; the Seed Shield trips at 6 words (3 in seed-looking fields), which leaves the rest of a 12-word seed far out of reach, but anything typed is seen.
- **Plain transfers.** Sending ETH/tokens to a wrong address, or a payable "claim" that just takes your ETH, look like normal transactions.
- **Inputs in *closed* shadow DOM**, wallets that don't expose an EIP-1193/EIP-6963 provider to the page, and a dedicated attacker who builds a kit specifically to beat PHPeek.
- **A legit site you trust that turns bad.** Read what your wallet shows you, every time.

**Real protection, layered:** hardware wallet with clear signing · a separate browser profile for crypto · transaction simulation (Rabby, MetaMask/Blockaid) · browser and OS updates · a password manager · 2FA with security keys.

## The fine print

- **Most well-run sites hide their PHP version.** You'll see 🟠 a lot. That's good security.
- **🔴 is a strong hint, not proof.** Debian, Ubuntu, RHEL backport fixes without bumping the version number.
- **It can't tell if a site was already hacked.** That's what the v1.1 guards are for.
- **Firefox:** grant PHPeek access to all sites (Add-ons → PHPeek → Permissions), or the guards can't run.

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

**Stores:** Chrome Web Store · Firefox Add-ons *(in review)*

**Manual (Chrome / Brave / Edge / Opera):**
1. Grab `phpeek-chrome.zip` from [Releases](../../releases) and unzip it.
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Turn on **Developer mode** → **Load unpacked** → pick the folder.

## Build & test it yourself

```sh
python3 build.py              # → dist/phpeek-chrome.zip, dist/phpeek-firefox.zip
node tests/unit.test.js       # PHP version + header logic
node tests/guards.test.js     # wallet / clipboard / seed rules
python3 tests/e2e.py          # PHP2Shell badge in real Chromium (needs Playwright)
python3 tests/e2e_guards.py   # guards + hostile-page attacks in real Chromium
```

| File | Runs in | Job |
|---|---|---|
| `src/inpage.js` | page world | Thin relay. Captures built-ins before the page runs, snapshots requests, decides nothing. |
| `src/rules.js` | isolated world | What counts as risky (wallet calls, typed data, clipboard). |
| `src/guard.js` | isolated world | Private channel, Seed Shield, clipboard decisions. |
| `src/background.js` | service worker | PHP2Shell check, warning windows, all warning text. |
| `src/warning.*` | extension window | The window you decide in. |

Found a bypass? Open an issue. That's how it gets better.

## License

MIT. Fork it, ship it, make the web safer.
