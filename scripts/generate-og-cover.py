#!/usr/bin/env python3
"""Generate the default Open Graph share card → public/assets/og-cover.jpg

1200×630 is the size Facebook / WeChat / X / iMessage previews expect. The
card composes three porky portraits from public/porkies/ over the site palette
(styles.css --paper / --rose / --peach / --ink) with the brand text.

One-off asset generator, run on macOS with Pillow (`python3 -m pip install
pillow`). CJK faces fall back Hiragino Sans GB → Heiti SC → Arial Unicode.

    python3 scripts/generate-og-cover.py
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORKIES = os.path.join(ROOT, "public", "porkies")
OUT = os.path.join(ROOT, "public", "assets", "og-cover.jpg")

W, H = 1200, 630

PAPER = (255, 248, 239)
PAPER_DEEP = (255, 233, 213)
INK = (78, 47, 51)
INK_SOFT = (113, 83, 93)
ROSE = (248, 166, 186)
ROSE_DEEP = (216, 107, 141)
PEACH = (245, 181, 126)
WHITE = (255, 252, 246)
LINE = (120, 76, 78)

CJK_BOLD = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 2),
    ("/System/Library/Fonts/STHeiti Medium.ttc", 1),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 0),
]
CJK_REGULAR = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
    ("/System/Library/Fonts/STHeiti Medium.ttc", 1),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 0),
]
LATIN_SEMIBOLD = [
    ("/System/Library/Fonts/Supplemental/Baskerville.ttc", 4),
    ("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", 0),
]
LATIN_ITALIC = [
    ("/System/Library/Fonts/Supplemental/Baskerville.ttc", 2),
    ("/System/Library/Fonts/Supplemental/Georgia Italic.ttf", 0),
    ("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", 0),
]

# (file, centre, radius) — the gentle giant, the diarist, and the tiny one.
PORTRAITS = [
    ("dadaizhu.png", (905, 282), 178),
    ("daidaizhu.png", (1060, 462), 122),
    ("xiaozhu.png", (752, 468), 98),
]


def load_font(candidates, size):
    for path, index in candidates:
        if not os.path.exists(path):
            continue
        try:
            return ImageFont.truetype(path, size, index=index)
        except OSError:
            continue
    sys.exit(f"no usable font among {[c[0] for c in candidates]}")


def vertical_gradient(top, bottom):
    strip = Image.new("RGB", (1, H))
    px = strip.load()
    for y in range(H):
        t = y / (H - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return strip.resize((W, H))


def soft_blob(canvas, bbox, color, alpha, blur):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(bbox, fill=(*color, alpha))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def circle_mask(radius):
    scale = 4
    big = Image.new("L", (2 * radius * scale, 2 * radius * scale), 0)
    ImageDraw.Draw(big).ellipse((0, 0, big.width - 1, big.height - 1), fill=255)
    return big.resize((2 * radius, 2 * radius), Image.LANCZOS)


def paste_portrait(canvas, filename, centre, radius):
    cx, cy = centre
    ring = 9

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        (cx - radius - ring, cy - radius - ring + 14, cx + radius + ring, cy + radius + ring + 14),
        fill=(104, 63, 45, 88),
    )
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(20)))

    ring_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ring_layer).ellipse(
        (cx - radius - ring, cy - radius - ring, cx + radius + ring, cy + radius + ring),
        fill=(*WHITE, 255),
    )
    canvas.alpha_composite(ring_layer)

    portrait = Image.open(os.path.join(PORKIES, filename)).convert("RGB")
    side = min(portrait.size)
    left = (portrait.width - side) // 2
    top = (portrait.height - side) // 2
    portrait = portrait.crop((left, top, left + side, top + side)).resize(
        (2 * radius, 2 * radius), Image.LANCZOS
    )
    canvas.paste(portrait, (cx - radius, cy - radius), circle_mask(radius))


def draw_tracked(draw, xy, text, font, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x


def draw_pig_icon(draw, origin, size):
    # Ported from public/assets/favicon.svg (64-unit viewBox).
    ox, oy = origin
    s = size / 64

    def pt(x, y):
        return (ox + x * s, oy + y * s)

    draw.polygon([pt(13, 27), pt(16, 8), pt(31, 15)], fill=ROSE)
    draw.polygon([pt(51, 27), pt(48, 8), pt(33, 15)], fill=ROSE)
    draw.ellipse([pt(14, 16), pt(50, 52)], fill=ROSE)
    draw.ellipse([pt(22, 32), pt(42, 48)], fill=(255, 217, 226))
    draw.ellipse([pt(23.5, 31.5), pt(27.5, 35.5)], fill=INK)
    draw.ellipse([pt(36.5, 31.5), pt(40.5, 35.5)], fill=INK)
    draw.ellipse([pt(26.5, 37), pt(30.5, 43)], fill=(174, 87, 119))
    draw.ellipse([pt(33.5, 37), pt(37.5, 43)], fill=(174, 87, 119))


def main():
    canvas = vertical_gradient(PAPER, PAPER_DEEP).convert("RGBA")

    soft_blob(canvas, (-220, -260, 460, 300), ROSE, 150, 90)
    soft_blob(canvas, (720, 300, 1420, 820), PEACH, 120, 100)
    soft_blob(canvas, (560, -200, 1100, 120), ROSE, 80, 90)

    for filename, centre, radius in PORTRAITS:
        paste_portrait(canvas, filename, centre, radius)

    draw = ImageDraw.Draw(canvas)

    eyebrow = load_font(LATIN_SEMIBOLD, 26)
    title = load_font(CJK_BOLD, 118)
    subtitle = load_font(CJK_REGULAR, 40)
    tagline = load_font(LATIN_ITALIC, 31)
    url_font = load_font(LATIN_SEMIBOLD, 24)

    x0 = 84
    draw_pig_icon(draw, (x0, 128), 46)
    draw_tracked(draw, (x0 + 60, 140), "COCHONNET VILLA", eyebrow, ROSE_DEEP, 4)

    draw.text((x0 - 6, 176), "猪猪山庄", font=title, fill=INK)
    draw.text((x0, 336), "15 只快乐小猪的家", font=subtitle, fill=INK_SOFT)
    draw.text((x0, 402), "Home of fifteen happy porkies", font=tagline, fill=INK_SOFT)

    label = "www.cochonnetvilla.ca"
    text_w = draw.textlength(label, font=url_font)
    pill = (x0, 496, x0 + text_w + 52, 550)
    draw.rounded_rectangle(pill, radius=27, fill=WHITE, outline=(*LINE, 60), width=1)
    draw.text((x0 + 26, 508), label, font=url_font, fill=ROSE_DEEP)

    canvas.convert("RGB").save(OUT, "JPEG", quality=90, subsampling=0, optimize=True, progressive=True)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
