"""
Make a fake "phone photo" of a filled template, so you can test the font maker
without printing anything.

    python tools/make_test_photo.py --font SomeHandwriting.ttf --out test_photos
    (leave out --font to use a plain built-in font)

It fills every box using the given font (with random wobble), then tilts the page,
adds a table background, uneven lighting, blur and noise, and saves JPGs.
"""
import argparse
import os
import random
import sys

import cv2
import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from qalam_fontmaker import layout as L, make_template_pdf  # noqa: E402

S = L.PX_PER_MM


def load_font(path, size):
    """A .ttf from disk, or Pillow's built-in font when no path is given."""
    return ImageFont.truetype(path, size) if path else ImageFont.load_default(size)


def cap_height_ratio(font_path):
    f = load_font(font_path, 1000)
    l, t, r, b = f.getbbox("H", anchor="ls")
    return -t / 1000


def fill_page(page_img, page, font_path, rng):
    img = page_img.convert("RGBA")
    ratio = cap_height_ratio(font_path)
    for cell in (c for c in L.cells() if c["page"] == page):
        cap_mm = (L.BASE_Y - L.CAP_Y) * rng.uniform(0.82, 1.0)
        font = load_font(font_path, int(cap_mm / ratio * S))
        layer = Image.new("RGBA", (L.BOX_W * S * 2, L.BOX_H * S * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        cx, base = layer.width // 2, int(L.BOX_H * S + (L.BASE_Y - L.BOX_H / 2) * S)
        d.text((cx + rng.uniform(-8, 8), base + rng.uniform(-4, 4)), cell["char"], font=font,
               fill=(28, 44, 130, 255), anchor="ms")
        layer = layer.rotate(rng.uniform(-5, 5), resample=Image.BICUBIC, center=(cx, base))
        x = int((cell["x"] + L.BOX_W / 2) * S) - layer.width // 2
        y = int((cell["y"] + L.BOX_H / 2) * S) - layer.height // 2
        img.alpha_composite(layer, (x, y))
    return img.convert("RGB")


def fake_photo(page_rgb, rng):
    src = np.array(page_rgb)[:, :, ::-1]
    h, w = src.shape[:2]
    W, H = 3000, 4000
    bg = np.full((H, W, 3), (60, 85, 110), np.uint8)
    bg = cv2.add(bg, np.random.default_rng(1).integers(0, 30, (H, W, 3), dtype=np.uint8))
    m = 230
    dst = np.float32([[m + rng.uniform(-90, 120), m + rng.uniform(-60, 140)],
                      [W - m + rng.uniform(-120, 90), m + rng.uniform(-60, 140)],
                      [W - m + rng.uniform(-140, 60), H - m + rng.uniform(-120, 60)],
                      [m + rng.uniform(-60, 140), H - m + rng.uniform(-120, 60)]])
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), dst)
    warped = cv2.warpPerspective(src, M, (W, H))
    mask = cv2.warpPerspective(np.full((h, w), 255, np.uint8), M, (W, H))
    out = np.where(mask[..., None] > 0, warped, bg).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    light = 0.72 + 0.28 * (xx / W) * 0.6 + 0.28 * (1 - yy / H) * 0.6     # uneven room lighting
    out *= light[..., None]
    out = cv2.GaussianBlur(out, (0, 0), 1.2)
    out += np.random.default_rng(2).normal(0, 6, out.shape)
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", help="a handwriting-style .ttf to fill the boxes with (default: a plain built-in font)")
    ap.add_argument("--out", default="test_photos")
    ap.add_argument("--seed", type=int, default=3)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rng = random.Random(a.seed)
    pdf = pdfium.PdfDocument(make_template_pdf())
    for p in range(len(pdf)):
        page_img = pdf[p].render(scale=S * 25.4 / 72).to_pil().resize((L.PAGE_W * S, L.PAGE_H * S))
        photo = fake_photo(fill_page(page_img, p, a.font, rng), rng)
        path = os.path.join(a.out, f"page{p + 1}.jpg")
        cv2.imwrite(path, photo, [cv2.IMWRITE_JPEG_QUALITY, 85])
        print("wrote", path)


if __name__ == "__main__":
    main()
