#!/usr/bin/env python3
"""Composes 1280x800 store screenshots from the popup captures made by tests/e2e.py."""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_icons import gradient, icon, YELLOW

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "store/screenshots"
NAVY = (22, 24, 48)
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

SLIDES = [
    ("store-1-exposed.png", 8001, "Is this site wide open to PHP2Shell?",
     "One glance. Red means the PHP on display is older than the fix."),
    ("store-2-eol.png", 8005, "Catches the dinosaurs",
     "PHP 8.1 and older never got a PHP2Shell fix. PHPeek flags them."),
    ("store-3-hidden.png", 8003, "Spots WordPress & Magento",
     "Even when a site hides its PHP version, you'll know it runs PHP."),
    ("store-4-patched.png", 8002, "Green? You're good.",
     "100% passive. No requests, no tracking, no data. Open source."),
]

def compose(name, port, title, sub):
    im = gradient(1280, 800).convert("RGBA")
    d = ImageDraw.Draw(im)
    logo = icon(72)
    im.paste(logo, (80, 70), logo)
    d.text((168, 82), "PHPeek", font=ImageFont.truetype(BOLD, 40), fill=(255, 255, 255))
    tfont, sfont = ImageFont.truetype(BOLD, 44), ImageFont.truetype(REG, 26)
    t = wrap(title, 19)
    th = d.multiline_textbbox((0, 0), t, font=tfont, spacing=12)[3]
    st = wrap(sub, 36)
    sh = d.multiline_textbbox((0, 0), st, font=sfont, spacing=10)[3]
    y0 = (800 - (th + 30 + sh)) // 2
    d.multiline_text((80, y0), t, font=tfont, fill=(255, 255, 255), spacing=12)
    d.multiline_text((80, y0 + th + 30), st, font=sfont, fill=(255, 235, 250), spacing=10)
    pop = Image.open(SHOTS / f"popup-{port}.png").convert("RGB")
    pop = pop.resize((int(pop.width * 1.6), int(pop.height * 1.6)), Image.LANCZOS)
    x, y = 1280 - pop.width - 90, (800 - pop.height) // 2
    shadow = Image.new("RGBA", (pop.width + 40, pop.height + 40), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([20, 20, pop.width + 20, pop.height + 20], 18, fill=(0, 0, 0, 120))
    im.paste(shadow, (x - 14, y - 6), shadow)
    mask = Image.new("L", pop.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pop.width - 1, pop.height - 1], 14, fill=255)
    im.paste(pop, (x, y), mask)
    im.convert("RGB").save(SHOTS / name)

def wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    return "\n".join(lines + [cur])

if __name__ == "__main__":
    for s in SLIDES:
        compose(*s)
    print("screenshots done")
