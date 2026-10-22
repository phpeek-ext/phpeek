<p align="center">
  <img src="store/icon-512.png" width="128" alt="PHPeek">
</p>

<h1 align="center">PHPeek</h1>
<p align="center"><i>Hacked-Site Shield: PHP2Shell check, card, password & wallet guards</i></p>
<p align="center"><b>Peek before you trust.</b><br>
Flags sites exposed to PHP2Shell, blocks card skimmers, and guards your passwords, seed phrase, wallet signatures and clipboard on every site.</p>

---

Millions of WordPress, Magento, Drupal and Joomla sites sit on top of PHP. In October 2026, **PHP2Shell** (CVE-2026-109618 / CVE-2026-109619) showed that a single request can take over a server running an unpatched PHP — no login, no plugin bug needed.

A hacked site doesn't attack *you* directly. It serves you something: a hidden script that copies your card at checkout, a server that leaks the password you just typed, a fake "restore your wallet" form, a drainer that asks you to sign an approval, a "verify you're human" page that puts a command in your clipboard. PHPeek watches for exactly that.

## What it does

### 👀 PHP2Shell check (v1)
Reads the headers your browser already received and badges its icon:

| Badge | What it means |
|---|---|
| 🔴 **!** | **Affected version advertised.** The server reports a PHP version older than the fix — or PHP 8.1 and below, which never got one. Avoid typing passwords or cards, or connecting your wallet here. |
| *(nothing)* | **No affected version advertised** — what the server reports, not a guarantee. |
| 🟠 **?** | **Runs PHP, keeps its version secret.** |
| *(nothing)* | **No PHP in sight.** |

A header is an observation, not a guarantee: versions can be hidden, stale or patched by a distro without changing the number. That's why there's no green "OK", and why the guards below don't depend on it.

The popup shows the verdict, not the exact version number, and a **📨 Tell the site owner** button that opens a ready-to-send email with the fix.

**🔎 Check any site (v1.2):** type an address in the popup to check a store *before* you open it or pay there. This is the one time PHPeek contacts a site: it loads that single page, without cookies, and reads the same headers.

### 💳 Card Guard (v1.2, every site)
- **Anti-skimmer.** Once you type a card number, PHPeek recognises it if a script tries to send it to a site that's neither the store nor a payment provider (Stripe, PayPal, Adyen…): via `fetch`, XHR, beacons, WebSockets, image/script URLs, injected HTML, forms or `window.open` — raw, URL-encoded, base64 (also in URL paths), or with the last digit dropped. The request fails like a network error and you're told where it was going. This is what common "Magecart" skimmers on hacked stores do. Works on any store, even when the PHP version is hidden.
- **You click Pay and the form posts your card to an unknown site?** PHPeek asks first: some small payment services work that way, and so do fake payment forms.
- **Heads-up on 🔴 stores.** Reach the card field on a store exposed to PHP2Shell and PHPeek suggests paying with PayPal / Apple Pay / Google Pay or a virtual card instead. Once per site.

### 🔑 Password Guard (v1.2)
On a 🔴 site, a heads-up when you reach a password field: PHP2Shell can leak server memory, including passwords people just typed. Use a unique password + 2FA, or wait for the patch. Once per site.

### 🛡️ Seed Shield (v1.1, every site)
If a seed phrase (BIP39 recovery words) is pasted or typed into a website, PHPeek clears it and warns you. No real site, wallet or support team ever asks for it.

### ✍️ Wallet signature check (v1.1, every site)
Before your wallet pops up, PHPeek pauses the requests drainers use and explains them in plain words:
unlimited token approvals, `setApprovalForAll` (all your NFTs), Permit / Permit2 gasless approvals, Seaport/Blur marketplace orders, delegations, blind `eth_sign` and hash signing. On a 🔴 site, *every* transaction gets a heads-up. You decide: cancel (default) or continue.

### 📋 Clipboard Guard (v1.1, every site)
"ClickFix" pages trick you into pasting a command into Run/Terminal. When a site silently writes a command like that to your clipboard, PHPeek swaps it for a harmless warning. Install commands shown openly in a code block (rustup, scoop…) are left alone.

**Warnings open in a PHPeek window, not on the page**, so a hacked site can't hide or fake them.

## 100% local. Zero data.

- **No requests of its own.** There's no PHPeek server. The only time PHPeek contacts a website is when *you* use **Check any site**: that one page (plus any redirect it answers with), without cookies.
- **No tracking, no storage.** Results live in session memory for the open tab. Card numbers, seed words and clipboard text are never stored or sent anywhere — not even to PHPeek's own background. A card number you type stays in that page's memory only, so PHPeek can recognise it leaving.
- **Only the tab you're on.** It never scans, crawls or lists sites.
- **Nothing to hide.** ~1,800 lines of plain, unminified, commented JavaScript. Read it.

See [PRIVACY.md](PRIVACY.md).

## Threat model — what it does and doesn't stop

PHPeek is **a safety net, not a shield.** Be clear-eyed about it:

**Stops (tested in real Chromium against hostile pages):**
- Common card skimmers that send the card number you typed to a third-party server (plain, URL-encoded, base64, reversed, from the page or a same-origin iframe).
- Generic phishing / drainer kits on hacked or fake sites: seed-phrase forms, approval/permit drainers, NFT `setApprovalForAll`, blind signing, ClickFix clipboard tricks (incl. hidden-textarea and obfuscated `p^o^w^e^r^s^h^e^l^l`).
- Pages that try to fight the **wallet and clipboard guards**: forging approval messages, faking PHPeek windows, deleting the guard, overriding JavaScript built-ins (`RegExp`, `String`, `Map`, `Promise`, `dispatchEvent`, `JSON`), prototype-call bypasses. Decisions are made in the extension's isolated world, which pages can't touch; when PHPeek can't verify a request, it cancels it.

**Doesn't stop:**
- **Malware already on your computer.** A browser extension can't see or fix that.
- **Clever skimmers.** Ones that encrypt the card before sending it, send it from a Web Worker, save it and send it from a later page, or post it back to the hacked store's own server look like normal checkout traffic. Hex-encoded numbers, numbers hidden in request headers, and WebSocket/`window.open` references a script saved before you typed the card aren't checked either. On Firefox, protection inside freshly created iframes may be weaker (untested there). The Card Guard wrappers are deliberately patchable (so monitoring libraries keep working), so a kit written specifically against PHPeek can get around them. Card fields inside the payment provider's own frame (Stripe, Adyen…) are out of a skimmer's reach anyway, so prefer stores that use them, or PayPal / Apple Pay / Google Pay.
- **Fake payment pages.** A hacked store can show its own fake card form that sends the card to the store's server. On a 🔴 store, PHPeek's heads-up is your cue to pay another way.
- **Keystrokes before detection.** A page's own key listeners see what you type; the Seed Shield trips at 6 words (3 in seed-looking fields), which leaves the rest of a 12-word seed far out of reach, but anything typed is seen.
- **Plain transfers.** Sending ETH/tokens to a wrong address, or a payable "claim" that just takes your ETH, look like normal transactions.
- **Inputs in *closed* shadow DOM**, wallets that don't expose an EIP-1193/EIP-6963 provider to the page, and a dedicated attacker who builds a kit specifically to beat PHPeek.
- **A legit site you trust that turns bad.** Read what your wallet shows you, every time.

**Real protection, layered:** hardware wallet with clear signing · a separate browser profile for crypto · transaction simulation (Rabby, MetaMask/Blockaid) · browser and OS updates · a password manager · 2FA with security keys.

## The fine print

- **Most well-run sites hide their PHP version.** You'll see 🟠 a lot. That's good security.
- **🔴 is a strong hint, not proof.** Debian, Ubuntu, RHEL backport fixes without bumping the version number.
- **It can't tell if a site was already hacked.** That's what the guards are for.
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
node tests/cards.test.js      # card numbers + skimmer decisions
python3 tests/e2e.py          # PHP2Shell badge in real Chromium (needs Playwright)
python3 tests/e2e_guards.py   # guards + hostile-page attacks in real Chromium
python3 tests/e2e_cards.py    # Card Guard, Password Guard, Check a site in real Chromium
```

| File | Runs in | Job |
|---|---|---|
| `src/inpage.js` | page world | Thin relay. Captures built-ins before the page runs, snapshots requests, decides nothing. |
| `src/rules.js` | isolated world | What counts as risky (wallet calls, typed data, clipboard). |
| `src/cards.js` | isolated world | Card numbers (Luhn + brand), payment providers, skimmer decision. |
| `src/guard.js` | isolated world | Private channel, Seed Shield, Card/Password Guard, clipboard decisions. |
| `src/background.js` | service worker | PHP2Shell check, Check a site, warning windows, all warning text. |
| `src/warning.*` | extension window | The window you decide in. |

Found a bypass? Open an issue. That's how it gets better.

## License

MIT. Fork it, ship it, make the web safer.
