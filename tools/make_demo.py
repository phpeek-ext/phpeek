#!/usr/bin/env python3
"""Renders a short demo video of PHPeek on fictional test sites (frames → ffmpeg)."""
import subprocess, sys, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_icons import gradient, icon

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "store/screenshots"
OUT = ROOT / "store/demo"
FR = OUT / "frames"
W, H, FPS = 1280, 720, 30
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
F = lambda s, b=False: ImageFont.truetype(BOLD if b else REG, s)

BADGE = {"!": (217, 48, 37), "OK": (24, 128, 56), "?": (227, 116, 0)}

SITES = [
    dict(url="old-shop.example", badge="!", popup=8001, title="Old Shop",
         tag="Handmade mugs & more", color=(196, 120, 72), caption="Old PHP? Red flag."),
    dict(url="patched-blog.example", badge="OK", popup=8002, title="Patched Blog",
         tag="Thoughts on coffee and code", color=(52, 120, 200), caption="Patched? All good."),
    dict(url="store.example", badge="?", popup=8003, title="Store",
         tag="Summer sale — 30% off", color=(40, 40, 40), caption="Hidden version? You'll still know."),
]

WIN = (90, 70, W - 90, H - 40)          # browser window box
BAR_Y = WIN[1] + 44                      # address bar row
ICON_C = (WIN[2] - 52, BAR_Y + 20)       # extension icon centre

def page(site):
    x0, y0, x1, y1 = WIN
    im = Image.new("RGB", (x1 - x0, y1 - y0 - 90), (250, 250, 248))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, im.width, 70], fill=site["color"])
    d.text((30, 20), site["title"], font=F(28, True), fill="white")
    d.text((40, 110), site["tag"], font=F(34, True), fill=(30, 30, 30))
    for i in range(3):
        bx = 40 + i * 340
        d.rounded_rectangle([bx, 180, bx + 300, 400], 14, fill=(232, 230, 226))
        d.rectangle([bx + 20, 420, bx + 240, 436], fill=(215, 213, 208))
        d.rectangle([bx + 20, 448, bx + 170, 462], fill=(225, 223, 218))
    return im

def frame(site, typed, loaded, badge_scale, popup_alpha, cursor, caption_alpha):
    im = gradient(W, H).convert("RGBA")
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = WIN
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0 + 6, y0 + 12, x1 + 6, y1 + 12], 16, fill=(0, 0, 0, 90))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12)))
    d.rounded_rectangle(WIN, 14, fill=(32, 33, 36))
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse([x0 + 18 + i * 22, y0 + 14, x0 + 30 + i * 22, y0 + 26], fill=c)
    d.rounded_rectangle([x0 + 70, BAR_Y, x1 - 100, BAR_Y + 40], 20, fill=(53, 54, 58))
    d.text((x0 + 96, BAR_Y + 9), typed + ("|" if not loaded else ""), font=F(18), fill=(232, 234, 237))
    # extension icon + badge
    ic = icon(34)
    im.paste(ic, (ICON_C[0] - 17, ICON_C[1] - 17), ic)
    if site and badge_scale > 0:
        t = site["badge"]; col = BADGE[t]
        bw = int((26 if len(t) == 1 else 38) * badge_scale); bh = int(22 * badge_scale)
        bx, by = ICON_C[0] + 2, ICON_C[1] + 1
        d.rounded_rectangle([bx, by, bx + bw, by + bh], 7, fill=col, outline=(32, 33, 36), width=2)
        if badge_scale > 0.8:
            d.text((bx + bw / 2, by + bh / 2), t, font=F(15, True), fill="white", anchor="mm")
    # page
    if site and loaded:
        pg = page(site)
        im.paste(pg, (x0, y0 + 90))
    else:
        d.rectangle([x0, y0 + 90, x1, y1 - 14], fill=(250, 250, 248))
    # popup
    if site and popup_alpha > 0:
        pop = Image.open(SHOTS / f"popup-{site['popup']}.png").convert("RGBA")
        pop = pop.resize((int(pop.width * 1.15), int(pop.height * 1.15)), Image.LANCZOS)
        px, py = ICON_C[0] - pop.width + 20, ICON_C[1] + 26
        s2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(s2).rounded_rectangle([px + 4, py + 8, px + pop.width + 4, py + pop.height + 8], 12,
                                             fill=(0, 0, 0, int(110 * popup_alpha)))
        im.alpha_composite(s2.filter(ImageFilter.GaussianBlur(10)))
        pop.putalpha(int(255 * popup_alpha))
        m = Image.new("L", pop.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, pop.width - 1, pop.height - 1], 12, fill=int(255 * popup_alpha))
        im.paste(pop, (px, py), m)
    # caption pill
    if site and caption_alpha > 0:
        txt = site["caption"]; fo = F(30, True)
        tw = d.textlength(txt, font=fo)
        cx, cy = x0 + 60, y1 - 110
        cap = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        cd = ImageDraw.Draw(cap)
        cd.rounded_rectangle([cx, cy, cx + tw + 48, cy + 60], 30, fill=(17, 16, 38, int(235 * caption_alpha)))
        cd.text((cx + 24, cy + 30), txt, font=fo, fill=(255, 255, 255, int(255 * caption_alpha)), anchor="lm")
        im.alpha_composite(cap)
    # cursor
    if cursor:
        cx, cy = cursor
        d.polygon([(cx, cy), (cx, cy + 22), (cx + 6, cy + 17), (cx + 11, cy + 27), (cx + 15, cy + 25),
                   (cx + 10, cy + 15), (cx + 17, cy + 15)], fill="white", outline="black")
    return im.convert("RGB")

def ease(t): return t * t * (3 - 2 * t)

def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def title_card(n, title, sub):
    frames = []
    for i in range(n):
        a = min(1, i / 10, (n - i) / 10)
        im = gradient(W, H).convert("RGBA")
        lg = icon(160); im.paste(lg, (W // 2 - 80, 150), lg)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
        d.text((W / 2, 370), title, font=F(64, True), fill=(255, 255, 255, int(255 * a)), anchor="mm")
        d.text((W / 2, 440), sub, font=F(30, True), fill=(250, 204, 21, int(255 * a)), anchor="mm")
        im.alpha_composite(layer)
        frames.append(im.convert("RGB"))
    return frames


NAVY_BG = (17, 16, 38)
YEL = (250, 204, 21)

def draw_mascot(size, look=0.0, blink=0.0, rise=1.0):
    """Mascot square: eyes rise over the wall (rise 0..1), pupils look -1..1, blink 0..1."""
    S = 512
    im = gradient(S, S)
    d = ImageDraw.Draw(im)
    wall = 300
    off = int((1 - rise) * 230)
    for cx in (172, 340):
        top, bot = wall - 165 + off, wall + 30 + off
        h = (bot - top) * (1 - 0.92 * blink)
        mid = (top + bot) / 2
        d.ellipse([cx - 80, mid - h / 2, cx + 80, mid + h / 2], fill="white")
        if blink < 0.6:
            px = cx + int(28 * look)
            d.ellipse([px - 36, wall - 105 + off, px + 36, wall - 5 + off], fill=NAVY_BG)
            d.ellipse([px - 5, wall - 92 + off, px + 20, wall - 67 + off], fill="white")
    d.rectangle([0, wall, S, S], fill=NAVY_BG)
    if rise > 0.85:
        for x in (75, 372):
            d.rounded_rectangle([x, wall - 35, x + 65, wall + 35], 28, fill=YEL)
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], 115, fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0)); out.paste(im, (0, 0), m)
    return out.resize((size, size), Image.LANCZOS)

def back(t, s=1.70158):  # ease-out-back (overshoot)
    t -= 1
    return t * t * ((s + 1) * t + s) + 1

def clamp(x): return max(0.0, min(1.0, x))

def text_layer(items):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for (xy, txt, fo, col, a, anchor) in items:
        if a > 0:
            d.text(xy, txt, font=fo, fill=(*col, int(255 * a)), anchor=anchor)
    return layer

def intro():
    frames = []
    hook1, hook2 = "PHP2Shell just dropped.", "Is the site you're on safe?"
    # part 1: dark hook, typed, red flicker
    n1 = 52
    for i in range(n1):
        im = Image.new("RGBA", (W, H), NAVY_BG + (255,))
        c1 = hook1[: int(len(hook1) * clamp(i / 16))]
        c2 = hook2[: int(len(hook2) * clamp((i - 22) / 18))]
        red = (255, 80, 80) if (i // 3) % 2 == 0 or i > 20 else (255, 255, 255)
        im.alpha_composite(text_layer([
            ((W / 2, H / 2 - 40), c1, F(54, True), red, 1, "mm"),
            ((W / 2, H / 2 + 40), c2, F(40, True), (255, 255, 255), 1, "mm"),
        ]))
        frames.append(im.convert("RGB"))
    # part 2: mascot rises, looks around, blinks, name pops
    n2 = 66
    for i in range(n2):
        im = gradient(W, H).convert("RGBA")
        rise = back(clamp(i / 14))
        look = [0, -1, -1, 1, 1, 0][min(5, max(0, (i - 14) // 7))] if i > 14 else 0
        blink = 1.0 if i in (50, 51) else (0.5 if i in (49, 52) else 0)
        m = draw_mascot(220, look=look, blink=blink, rise=min(rise, 1.08))
        im.paste(m, (W // 2 - 110, 120), m)
        ts = back(clamp((i - 18) / 10))
        if ts > 0:
            fo = F(max(8, int(80 * ts)), True)
            im.alpha_composite(text_layer([((W / 2, 420), "PHPeek", fo, (255, 255, 255), clamp(ts), "mm")]))
        a = clamp((i - 30) / 8)
        im.alpha_composite(text_layer([((W / 2, 495), "Peek before you trust.", F(34, True), YEL, a, "mm")]))
        frames.append(im.convert("RGB"))
    return frames

def outro():
    frames = []
    n = 96
    badges = [("!", BADGE["!"], -260), ("OK", BADGE["OK"], 0), ("?", BADGE["?"], 260)]
    for i in range(n):
        im = gradient(W, H).convert("RGBA")
        look = 0 if i < 30 else (-1 if i < 50 else (1 if i < 70 else 0))
        blink = 1.0 if i in (78, 79) else 0
        m = draw_mascot(170, look=look, blink=blink)
        im.paste(m, (W // 2 - 85, 70), m)
        d = ImageDraw.Draw(im)
        for k, (t, col, dx) in enumerate(badges):
            sc = back(clamp((i - 6 - k * 6) / 8))
            if sc > 0:
                w = (70 if len(t) == 1 else 100) * sc; h = 60 * sc
                cx, cy = W / 2 + dx, 330
                d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], int(18 * sc), fill=col)
                if sc > 0.7:
                    d.text((cx, cy), t, font=F(int(34 * min(sc, 1.1)), True), fill="white", anchor="mm")
        labels = ["exposed", "patched", "hidden"]
        items = []
        for k, (_, _, dx) in enumerate(badges):
            items.append(((W / 2 + dx, 385), labels[k], F(24, True), (255, 255, 255), clamp((i - 14 - k * 6) / 8), "mm"))
        items.append(((W / 2, 470), "Free  ·  Open source  ·  Zero data", F(36, True), (255, 255, 255), clamp((i - 34) / 10), "mm"))
        im.alpha_composite(text_layer(items))
        pa = back(clamp((i - 46) / 10))
        if pa > 0:
            url = "github.com/phpeek-ext/phpeek"; fo = F(30, True)
            tw = d.textlength(url, font=fo)
            pw, ph = (tw + 60) * pa, 64 * pa
            pill = Image.new("RGBA", (W, H), (0, 0, 0, 0)); pd = ImageDraw.Draw(pill)
            pd.rounded_rectangle([W / 2 - pw / 2, 540 - ph / 2, W / 2 + pw / 2, 540 + ph / 2], int(32 * pa), fill=YEL + (255,))
            if pa > 0.8:
                pd.text((W / 2, 540), url, font=fo, fill=NAVY_BG, anchor="mm")
            im.alpha_composite(pill)
        frames.append(im.convert("RGB"))
    return frames

def main():
    shutil.rmtree(FR, ignore_errors=True); FR.mkdir(parents=True)
    frames = intro()
    rest = (W // 2, H // 2 + 120)
    for site in SITES:
        url = site["url"]
        for i in range(len(url) + 1):          # typing
            frames.append(frame(site, url[:i], False, 0, 0, rest, 0))
        for _ in range(8):
            frames.append(frame(site, url, True, 0, 0, rest, 0))
        for i in range(8):                     # badge pops
            frames.append(frame(site, url, True, ease((i + 1) / 8) * 1.15 if i < 6 else 1, 0, rest, 0))
        for _ in range(14):
            frames.append(frame(site, url, True, 1, 0, rest, 0))
        for i in range(18):                    # cursor to icon
            frames.append(frame(site, url, True, 1, 0, lerp(rest, (ICON_C[0] - 22, ICON_C[1] - 6), ease(i / 17)), 0))
        for i in range(10):                    # popup + caption fade in
            a = ease((i + 1) / 10)
            frames.append(frame(site, url, True, 1, a, (ICON_C[0] - 22, ICON_C[1] - 6), a))
        for _ in range(60):                    # hold
            frames.append(frame(site, url, True, 1, 1, (ICON_C[0] - 22, ICON_C[1] - 6), 1))
        for i in range(8):                     # fade out popup
            a = 1 - ease((i + 1) / 8)
            frames.append(frame(site, url, True, 1, a, (ICON_C[0] - 22, ICON_C[1] - 6), a))
        rest = (ICON_C[0] - 300, ICON_C[1] + 200)
    frames += outro()
    for i, f in enumerate(frames):
        f.save(FR / f"{i:04d}.png")
    mp4 = OUT / "phpeek-demo.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(FR / "%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", str(mp4)], check=True)
    gif = OUT / "phpeek-demo.gif"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp4), "-vf",
                    "fps=15,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer",
                    str(gif)], check=True)
    shutil.rmtree(FR)
    print(f"{len(frames)} frames → {mp4.name}, {gif.name}")

if __name__ == "__main__":
    main()
