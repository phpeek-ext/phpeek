#!/usr/bin/env python3
"""Draws the PHPeek mascot (two eyes peeking over a wall) and the store promo tiles."""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
S = 1024
VIOLET, PINK = (124, 58, 237), (236, 72, 153)
NAVY, WHITE, YELLOW = (17, 16, 38), (255, 255, 255), (250, 204, 21)
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def gradient(w, h):
    # diagonal violet → pink
    base = Image.new("RGB", (w, h), VIOLET)
    top = Image.new("RGB", (w, h), PINK)
    v = Image.linear_gradient("L").resize((w, h))
    hz = Image.linear_gradient("L").rotate(90).transpose(Image.FLIP_LEFT_RIGHT).resize((w, h))
    mask = ImageChops.add(v, hz, scale=2)
    return Image.composite(top, base, mask)

def mascot(hands=True, wall_top=600):
    im = gradient(S, S)
    d = ImageDraw.Draw(im)
    for cx in (345, 679):
        d.ellipse([cx - 160, wall_top - 330, cx + 160, wall_top + 60], fill=WHITE)
        # pupils glance to the right: suspicious side-eye
        px = cx + 55
        d.ellipse([px - 72, wall_top - 210, px + 72, wall_top - 10], fill=NAVY)
        d.ellipse([px - 10, wall_top - 185, px + 40, wall_top - 135], fill=WHITE)
    d.rectangle([0, wall_top, S, S], fill=NAVY)
    if hands:
        for x in (150, 744):
            d.rounded_rectangle([x, wall_top - 70, x + 130, wall_top + 70], 55, fill=YELLOW)
            for k in (1, 2):  # finger gaps
                fx = x + k * 130 // 3
                d.line([(fx, wall_top - 70), (fx, wall_top - 10)], fill=(214, 168, 0), width=10)
    else:
        d.rectangle([0, wall_top - 18, S, wall_top + 18], fill=YELLOW)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], 230, fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out

def icon(size):
    return mascot(hands=size >= 32).resize((size, size), Image.LANCZOS)

def fit(d, text, path, max_w, start):
    size = start
    while size > 8 and d.textlength(text, font=ImageFont.truetype(path, size)) > max_w:
        size -= 1
    return ImageFont.truetype(path, size)

def tile(w, h, out):
    im = gradient(w, h).convert("RGBA")
    d = ImageDraw.Draw(im)
    s = int(min(h * 0.55, w * 0.3))
    logo = icon(s)
    lx = int(w * 0.07)
    im.paste(logo, (lx, (h - s) // 2), logo)
    x = lx + s + int(w * 0.05)
    max_w = w - x - int(w * 0.06)
    lines = [("PHPeek", BOLD, h * 0.24, WHITE),
             ("Peek before you trust.", BOLD, h * 0.085, YELLOW),
             ("Instant PHP2Shell check for any site", REG, h * 0.06, (255, 235, 250))]
    fonts = [fit(d, t, f, max_w, int(sz)) for t, f, sz, _ in lines]
    heights = [d.textbbox((0, 0), t, font=fo)[3] for (t, *_), fo in zip(lines, fonts)]
    gap = int(h * 0.04)
    y = (h - (sum(heights) + gap * 2)) // 2
    for (t, _, _, col), fo, hh in zip(lines, fonts, heights):
        d.text((x, y), t, font=fo, fill=col)
        y += hh + gap
    im.convert("RGB").save(out)

if __name__ == "__main__":
    for s in (16, 32, 48, 128):
        icon(s).save(ROOT / "src/icons" / f"icon-{s}.png")
    icon(512).save(ROOT / "store/icon-512.png")
    tile(440, 280, ROOT / "store/promo-small-440x280.png")
    tile(1400, 560, ROOT / "store/promo-marquee-1400x560.png")
    print("icons done")
