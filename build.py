#!/usr/bin/env python3
"""Builds dist/phpeek-chrome.zip (Chrome, Brave, Edge, Opera) and dist/phpeek-firefox.zip."""
import json, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).parent
SRC, DIST = ROOT / "src", ROOT / "dist"
FIREFOX_ID = "phpeek@phpeek-extension"

def manifest(target):
    m = json.loads((ROOT / "manifest.base.json").read_text())
    if target == "chrome":
        m["background"] = {"service_worker": "background.js"}
        m["minimum_chrome_version"] = "102"
    else:
        m["background"] = {"scripts": ["background.js"]}
        m["browser_specific_settings"] = {
            "gecko": {
                "id": FIREFOX_ID,
                "strict_min_version": "142.0",
                "data_collection_permissions": {"required": ["none"]},
            }
        }
    return m

def build(target):
    out = DIST / target
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(SRC, out)
    (out / "manifest.json").write_text(json.dumps(manifest(target), indent=2, ensure_ascii=False) + "\n")
    zpath = DIST / f"phpeek-{target}.zip"
    zpath.unlink(missing_ok=True)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                # Fixed timestamp: no build-time metadata in the archive.
                info = zipfile.ZipInfo(str(f.relative_to(out)), date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, f.read_bytes())
    print(f"built {zpath.relative_to(ROOT)}")

if __name__ == "__main__":
    DIST.mkdir(exist_ok=True)
    for t in ("chrome", "firefox"):
        build(t)
