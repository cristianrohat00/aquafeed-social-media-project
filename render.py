"""Aquafeed Distribution image pipeline (Pillow).

Two templates, 1080x1350 (Facebook 4:5 feed):
  overlay(photo, title, sub)  -> supplier/own photo + gradient + Romanian text + branding
  card(title, bullets, kicker) -> branded card / simple infographic, no photo needed

Usage from the agent: import render; render.overlay(...); render.card(...)
"""
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "step1", "brand", "Original_Logo_with_text.png")
BIOMAR_LOGO = os.path.join(HERE, "step1", "brand", "biomar-logo-rgb-01.png")
FONT_DIR = "/usr/share/fonts/opentype/inter"
W, H = 1080, 1350

NAVY = (26, 50, 100)
BLUE = (30, 111, 217)
GREEN = (74, 154, 26)
LIME = (200, 224, 0)
WHITE = (255, 255, 255)
CTA = "aquafeed-biomar.ro  ·  comenzi@aquafeed-biomar.ro"


FONTS_DIR = os.path.join(HERE, "fonts")
INTER = lambda w: (os.path.join(FONT_DIR, f"Inter-{w}.otf"), None)
INTERD = lambda w: (os.path.join(FONT_DIR, f"InterDisplay-{w}.otf"), None)
VAR = lambda f, *axes: (os.path.join(FONTS_DIR, f), list(axes))

# role -> (font file, variable-font axes or None). title_scale shrinks headline sizes.
THEMES = {
    "original":  {"Title": INTER("Bold"), "Body": INTER("Medium"), "Label": INTER("SemiBold"),
                  "Num": INTER("Bold"), "Regular": INTER("Regular"), "title_scale": 1.0, "body_scale": 1.0},
    "clean":     {"Title": INTERD("SemiBold"), "Body": INTER("Regular"), "Label": INTER("SemiBold"),
                  "Num": INTER("SemiBold"), "Regular": INTER("Regular"), "title_scale": 0.84, "body_scale": 0.9},
    "editorial": {"Title": VAR("SourceSerif4.ttf", 620, 48), "Body": INTER("Regular"), "Label": INTER("SemiBold"),
                  "Num": INTER("SemiBold"), "Regular": INTER("Regular"), "title_scale": 0.9, "body_scale": 1.0},
    "modern":    {"Title": VAR("Montserrat.ttf", 600), "Body": VAR("Montserrat.ttf", 400), "Label": VAR("Montserrat.ttf", 600),
                  "Num": VAR("Montserrat.ttf", 700), "Regular": VAR("Montserrat.ttf", 400), "title_scale": 0.8, "body_scale": 0.86},
}
THEME = THEMES["editorial"]
_cache = {}


def set_theme(name):
    global THEME
    THEME = THEMES[name]


def font(role, size):
    role = {"Bold": "Label", "SemiBold": "Label", "Medium": "Body"}.get(role, role)
    path, axes = THEME[role]
    key = (path, tuple(axes or ()), size)
    if key not in _cache:
        f = ImageFont.truetype(path, size)
        if axes:
            f.set_variation_by_axes(axes)
        _cache[key] = f
    return _cache[key]


def wrap(draw, text, fnt, max_w):
    lines = []
    for para in text.split("\n"):
        words, cur = para.split(), ""
        for w in words:
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=fnt) <= max_w:
                cur = t
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def fit_text(draw, text, weight, max_w, max_h, start=96, min_size=40, spacing=1.12):
    size = start
    while size >= min_size:
        f = font(weight, size)
        lines = wrap(draw, text, f, max_w)
        h = int(len(lines) * size * spacing)
        if h <= max_h:
            return f, lines, size
        size -= 4
    f = font(weight, min_size)
    return f, wrap(draw, text, f, max_w), min_size


def logo_badge(height=120, path=None):
    lg = Image.open(path or LOGO).convert("RGBA")
    lg = lg.crop(lg.getbbox())
    # logo has white bg: keep it on a white rounded pill
    r = height / lg.height
    lg = lg.resize((int(lg.width * r), height), Image.LANCZOS)
    pad = 14
    badge = Image.new("RGBA", (lg.width + 2 * pad, height + 2 * pad), (0, 0, 0, 0))
    m = Image.new("L", badge.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, *badge.size], 22, fill=255)
    white = Image.new("RGBA", badge.size, WHITE + (255,))
    badge.paste(white, (0, 0), m)
    badge.alpha_composite(lg, (pad, pad))
    return badge


def logos(img, height):
    """Aquafeed badge top-left; BioMar badge top-right unless the photo already shows BioMar."""
    img.alpha_composite(logo_badge(height), (40, 40))
    if BIOMAR:
        b = logo_badge(height, BIOMAR_LOGO)
        img.alpha_composite(b, (W - 40 - b.width, 40))


BIOMAR = True  # set per image: render.BIOMAR = False when the photo already shows the BioMar logo


def footer(img, d, cta):
    """Bottom brand bar: navy band, lime accent line, CTA text."""
    bar_h = 110
    d.rectangle([0, H - bar_h, W, H], fill=NAVY)
    d.rectangle([0, H - bar_h, W, H - bar_h + 8], fill=LIME)
    f = font("SemiBold", 34)
    d.text((48, H - bar_h + 36), cta, font=f, fill=WHITE)


def overlay(photo_path, title, sub, out, cta=CTA, tag=None, credit=None):
    img = Image.open(photo_path).convert("RGB")
    img = ImageOps.fit(img, (W, H), Image.LANCZOS, centering=(0.5, 0.4)).convert("RGBA")
    # bottom gradient for legibility
    grad = Image.new("L", (1, H), 0)
    for y in range(H):
        t = max(0, (y - H * 0.30) / (H * 0.55))
        grad.putpixel((0, y), int(245 * min(1, t ** 0.8)))
    grad = grad.resize((W, H))
    shade = Image.new("RGBA", (W, H), (10, 24, 52, 255))
    img = Image.composite(shade, img, grad)
    d = ImageDraw.Draw(img)
    logos(img, 110)
    if tag:
        ft = font("Bold", 30)
        tw = d.textlength(tag.upper(), font=ft)
        d.rounded_rectangle([W - tw - 88, 52, W - 40, 112], 30, fill=LIME)
        d.text((W - tw - 64, 64), tag.upper(), font=ft, fill=NAVY)
    max_w = W - 96
    fs, slines, ss = fit_text(d, sub, "Body", max_w, 220, start=int(40 * THEME["body_scale"]), min_size=30, spacing=1.3) if sub else (None, [], 0)
    sub_h = int(len(slines) * ss * 1.3)
    ft_, tlines, ts = fit_text(d, title, "Title", max_w, 380, start=int(84 * THEME["title_scale"]), min_size=44)
    title_h = int(len(tlines) * ts * 1.12)
    y = H - 110 - 48 - sub_h - (28 if sub else 0) - title_h
    d.rectangle([48, y - 28, 168, y - 20], fill=LIME)
    for ln in tlines:
        d.text((48, y), ln, font=ft_, fill=WHITE)
        y += int(ts * 1.12)
    y += 28
    for ln in slines:
        d.text((48, y), ln, font=fs, fill=(225, 232, 245))
        y += int(ss * 1.3)
    if credit:
        fc = font("Regular", 22)
        d.text((W - 48 - d.textlength(credit, font=fc), H - 110 - 34), credit, font=fc, fill=(190, 200, 220))
    footer(img, d, cta)
    img.convert("RGB").save(out, quality=92)
    return out


def card(kicker, title, bullets, out, cta=CTA, numbered=False, source=None, bg_photo=None,
         header_photo=None, header_h=500, header_crop=None, credit=None, note=None):
    """Branded list card. With header_photo: photo on top, list on navy panel below (preferred)."""
    if header_photo:
        img = Image.new("RGBA", (W, H), NAVY + (255,))
        ph = Image.open(header_photo).convert("RGB")
        if header_crop:
            w0, h0 = ph.size
            ph = ph.crop((int(header_crop[0] * w0), int(header_crop[1] * h0), int(header_crop[2] * w0), int(header_crop[3] * h0)))
        img.paste(ImageOps.fit(ph, (W, header_h), Image.LANCZOS), (0, 0))
        d0 = ImageDraw.Draw(img)
        d0.rectangle([0, header_h, W, header_h + 8], fill=LIME)
        if credit:
            fc = font("Regular", 22)
            tw = d0.textlength(credit, font=fc)
            d0.rounded_rectangle([W - tw - 64, header_h - 50, W - 24, header_h - 14], 10, fill=(0, 0, 0, 140))
            d0.text((W - tw - 44, header_h - 46), credit, font=fc, fill=WHITE)
    elif bg_photo:
        base = ImageOps.fit(Image.open(bg_photo).convert("RGB"), (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(18))
        img = Image.blend(base, Image.new("RGB", (W, H), NAVY), 0.82).convert("RGBA")
    else:
        img = Image.new("RGBA", (W, H), NAVY + (255,))
        d0 = ImageDraw.Draw(img)
        for i in range(H):  # subtle navy -> blue vertical gradient
            t = i / H
            c = tuple(int(NAVY[k] * (1 - t * 0.35) + BLUE[k] * t * 0.35) for k in range(3))
            d0.line([(0, i), (W, i)], fill=c)
    d = ImageDraw.Draw(img)
    logos(img, 100)
    y = header_h + 40 if header_photo else 230
    fk = font("Bold", 30)
    kw = d.textlength(kicker.upper(), font=fk)
    d.rounded_rectangle([48, y, 48 + kw + 48, y + 58], 29, fill=LIME)
    d.text((72, y + 12), kicker.upper(), font=fk, fill=NAVY)
    y += 90 if header_photo else 100
    ft_, tlines, ts = fit_text(d, title, "Title", W - 96, 170 if header_photo else 300, start=int((64 if header_photo else 78) * THEME["title_scale"]), min_size=40)
    for ln in tlines:
        d.text((48, y), ln, font=ft_, fill=WHITE)
        y += int(ts * 1.12)
    y += 24 if header_photo else 40
    bottom = H - 110 - (40 if header_photo else 60) - (40 if source else 0)
    note_lines, note_f, note_s = [], None, 0
    if note:
        note_s = int(40 * THEME["body_scale"])
        note_f = font("Title", note_s)
        note_lines = wrap(d, note, note_f, W - 96 - 40)
        bottom -= int(len(note_lines) * note_s * 1.3) + 30
    blocks = []
    for b in bullets:
        size = int(40 * THEME["body_scale"])
        fb = font("Body", size)
        lines = wrap(d, b, fb, W - 96 - 90)
        blocks.append((fb, size, lines))
    def block_h(bl):
        return max(64, int(len(bl[2]) * bl[1] * 1.28) + 6)
    total = sum(block_h(b) for b in blocks)
    while total + 24 * len(blocks) > bottom - y and blocks[0][1] > 28:
        blocks = [(font("Body", b[1] - 2), b[1] - 2, wrap(d, bb, font("Body", b[1] - 2), W - 96 - 90)) for b, bb in zip(blocks, bullets)]
        total = sum(block_h(b) for b in blocks)
    gap = min(70, max(24, (bottom - y - total) // max(1, len(blocks))))
    for i, (fb, size, lines) in enumerate(blocks):
        if numbered:
            d.ellipse([48, y + 2, 104, y + 58], fill=LIME)
            n = str(i + 1)
            fn = font("Num", 30)
            d.text((76 - d.textlength(n, font=fn) / 2, y + 10), n, font=fn, fill=NAVY)
        else:
            d.rounded_rectangle([56, y + 16, 96, y + 40], 8, fill=LIME)
        yy = y + 6
        for ln in lines:
            d.text((138, yy), ln, font=fb, fill=WHITE)
            yy += int(size * 1.28)
        y = y + block_h((fb, size, lines)) + gap
    if note_lines:
        ny = y - gap + 30
        d.rectangle([48, ny + 4, 54, ny + int(len(note_lines) * note_s * 1.3) - 6], fill=LIME)
        for ln in note_lines:
            d.text((76, ny), ln, font=note_f, fill=WHITE)
            ny += int(note_s * 1.3)
    if source:
        fs = font("Regular", 22)
        d.text((48, H - 110 - 46), source, font=fs, fill=(170, 185, 215))
    footer(img, d, cta)
    img.convert("RGB").save(out, quality=92)
    return out


def split(photo_path, kicker, title, body, out, crop=None, photo_h=640, cta=CTA, credit=None, sharpen=False):
    """Photo on top (optionally cropped to a text-free region), navy panel with Romanian text below."""
    img = Image.new("RGBA", (W, H), NAVY + (255,))
    ph = Image.open(photo_path).convert("RGB")
    if crop:
        w0, h0 = ph.size
        ph = ph.crop((int(crop[0] * w0), int(crop[1] * h0), int(crop[2] * w0), int(crop[3] * h0)))
    ph = ImageOps.fit(ph, (W, photo_h), Image.LANCZOS)
    if sharpen:
        ph = ph.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    img.paste(ph, (0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, photo_h, W, photo_h + 8], fill=LIME)
    logos(img, 100)
    if credit:
        fc = font("Regular", 22)
        tw = d.textlength(credit, font=fc)
        d.rounded_rectangle([W - tw - 64, photo_h - 50, W - 24, photo_h - 14], 10, fill=(0, 0, 0, 140))
        d.text((W - tw - 44, photo_h - 46), credit, font=fc, fill=WHITE)
    y = photo_h + 50
    fk = font("Bold", 28)
    kw = d.textlength(kicker.upper(), font=fk)
    d.rounded_rectangle([48, y, 48 + kw + 44, y + 54], 27, fill=LIME)
    d.text((70, y + 11), kicker.upper(), font=fk, fill=NAVY)
    y += 84
    ft_, tlines, ts = fit_text(d, title, "Title", W - 96, 230, start=int(66 * THEME["title_scale"]), min_size=44)
    for ln in tlines:
        d.text((48, y), ln, font=ft_, fill=WHITE)
        y += int(ts * 1.12)
    y += 30
    fb, blines, bs = fit_text(d, body, "Body", W - 96, H - 110 - 40 - y, start=int(40 * THEME["body_scale"]), min_size=26, spacing=1.3)
    for ln in blines:
        d.text((48, y), ln, font=fb, fill=(220, 230, 245))
        y += int(bs * 1.3)
    footer(img, d, cta)
    img.convert("RGB").save(out, quality=92)
    return out
