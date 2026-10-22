#!/usr/bin/env python3
"""Loads the built Chrome extension in Chromium, visits fake sites and checks badge + popup.
Also saves popup screenshots for the store listing."""
import json, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "dist/chrome"
SHOTS = ROOT / "store/screenshots"

SITES = {
    8001: ({"X-Powered-By": "PHP/8.2.10"}, '<script src="/wp-content/themes/x/app.js"></script>', "!"),
    8002: ({"X-Powered-By": "PHP/8.3.36"}, "", ""),
    8003: ({"Set-Cookie": "PHPSESSID=abc; Path=/"}, '<script type="text/x-magento-init">{}</script>', "?"),
    8004: ({"Server": "nginx"}, "", ""),
    8005: ({"Server": "Apache/2.4.41 (Ubuntu) PHP/7.4.3"}, '<meta name="generator" content="WordPress 6.2">', "!"),
}
HOSTS = {8001: "old-shop.example", 8002: "patched-blog.example", 8003: "store.example",
         8004: "static.example", 8005: "legacy-news.example"}

def handler_for(port):
    headers, body, _ = SITES[port]
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            for k, v in headers.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(f"<html><head>{body}</head><body>test</body></html>".encode())
        def log_message(self, *a): pass
    return H

def main():
    for port in SITES:
        srv = ThreadingHTTPServer(("127.0.0.1", port), handler_for(port))
        threading.Thread(target=srv.serve_forever, daemon=True).start()

    failures = 0
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            "", headless=True, channel="chromium",
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}",
                  "--host-resolver-rules=MAP *.example 127.0.0.1"],
        )
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        try:  # close_welcome: the first-install page would skew page counts
            (next((pg for pg in ctx.pages if pg.url.endswith("/welcome.html")), None) or ctx.wait_for_event("page", predicate=lambda pg: pg.url.endswith("/welcome.html"), timeout=8000)).close()
        except Exception:
            pass
        ext_id = sw.url.split("/")[2]
        # Warm-up: the very first request after browser start can land before the
        # worker's listener is live (same as restored tabs at startup in real use).
        warm = ctx.new_page(); warm.goto("http://static.example:8004/"); time.sleep(0.5); warm.close()

        for port, (_, _, expected) in SITES.items():
            page = ctx.new_page()
            page.goto(f"http://{HOSTS[port]}:{port}/")
            tab_id = sw.evaluate(f"async () => (await chrome.tabs.query({{url:'*://{HOSTS[port]}/*'}}))[0].id")
            state = None
            for _ in range(30):  # wait up to 3 s for the content-script hints to land
                time.sleep(0.1)
                state = sw.evaluate(f"async () => (await chrome.storage.session.get('tab_{tab_id}'))['tab_{tab_id}']")
                if state and (state["cms"] or SITES[port][1] == ""):
                    break
            time.sleep(0.2)
            badge = sw.evaluate(f"async () => await chrome.action.getBadgeText({{tabId:{tab_id}}})")
            if not state:
                print(f"FAIL {HOSTS[port]}: no state recorded"); failures += 1; page.close(); continue
            ok = badge == expected
            failures += not ok
            print(f"{'PASS' if ok else 'FAIL'} {HOSTS[port]}: badge={badge!r} expected={expected!r} "
                  f"php={state.get('phpVersion')} cms={state.get('cms')} status={state['assessment']['status']}")

            popup = ctx.new_page()
            popup.add_init_script(f"""
              const _q = chrome.tabs.query.bind(chrome.tabs);
              chrome.tabs.query = async () => [{{ id: {tab_id} }}];
            """)
            popup.set_viewport_size({"width": 320, "height": 260})
            popup.goto(f"chrome-extension://{ext_id}/popup.html")
            time.sleep(0.4)
            box = popup.evaluate("() => document.body.scrollHeight")
            popup.set_viewport_size({"width": 320, "height": box})
            popup.screenshot(path=str(SHOTS / f"popup-{port}.png"))
            popup.close()
            page.close()
        ctx.close()
    print("all passed" if not failures else f"{failures} failure(s)")
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    main()
