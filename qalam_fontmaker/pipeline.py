"""The whole job: photos in, font out."""
import base64
import io

from PIL import Image, ImageDraw, ImageFont, features

from . import layout as L
from .glyphs import build_font, trace
from .scan import TemplateError, find_page, ink_mask, load_image, read_cells

__all__ = ["make_font", "TemplateError"]

PREVIEW_LINES = [
    "The quick brown fox jumps over the lazy dog.",
    "Hello! This is my own handwriting, made into a font.",
    "ABCDEFGHIJKLM NOPQRSTUVWXYZ",
    "0123456789  (what?)  50% + 2 = yes; \"done\" & @home",
]


def make_font(images, family="My Handwriting", threshold=0.66):
    """
    images: list of photos/scans (bytes or file paths), one per template page, any order.
    Returns a dict with the font file, a preview image and a report of anything missing.
    """
    if not images:
        raise TemplateError("Upload at least one photo of a filled template page.")
    samples, pages, warnings = {}, [], []
    for n, data in enumerate(images, 1):
        gray = load_image(data)
        try:
            page, H = find_page(gray)
        except TemplateError as e:
            raise TemplateError(f"Image {n}: {e}") from None
        if page in pages:
            warnings.append(f"Page {page + 1} was uploaded twice; the later photo was used.")
            for ch in [c["char"] for c in L.cells() if c["page"] == page]:
                samples.pop(ch, None)
        pages.append(page)
        mask = ink_mask(gray, H, threshold)
        edge_chars = []
        for ch, variant, bmp, base_row, edge in read_cells(mask, page):
            samples.setdefault(ch, []).append(trace(bmp, base_row))
            if edge and ch not in edge_chars:
                edge_chars.append(ch)
        if edge_chars:
            warnings.append(f"On page {page + 1}, these touch the edge of their box and may be cut off: "
                            + " ".join(edge_chars))

    if not samples:
        raise TemplateError("The page was found but no handwriting was detected. Use a dark pen and "
                            "make sure the photo isn't overexposed.")
    ttf, variants = build_font(samples, family)
    missing = [ch for ch in L.CHARSET if ch not in samples]
    missing_pages = [p + 1 for p in range(L.PAGES) if p not in pages]
    return {
        "family": family,
        "ttf": ttf,
        "preview_png": render_preview(ttf),
        "variants": variants,
        "missing": missing,
        "missing_pages": missing_pages,
        "warnings": warnings,
    }


def render_preview(ttf, size=64):
    layout = ImageFont.Layout.RAQM if features.check("raqm") else ImageFont.Layout.BASIC
    font = ImageFont.truetype(io.BytesIO(ttf), size, layout_engine=layout)
    line_h = int(size * 1.5)
    width = max(int(font.getlength(t)) for t in PREVIEW_LINES) + 80
    img = Image.new("RGB", (width, line_h * len(PREVIEW_LINES) + 60), (253, 253, 250))
    d = ImageDraw.Draw(img)
    for i, t in enumerate(PREVIEW_LINES):
        y = 30 + i * line_h + int(size * 1.05)
        d.line([(30, y + 4), (width - 30, y + 4)], fill=(200, 215, 235), width=2)
        d.text((40, y), t, font=font, fill=(30, 58, 158), anchor="ls")
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def to_json(result):
    """Result -> JSON-safe dict (files as base64) for the web API."""
    return {
        "family": result["family"],
        "font_base64": base64.b64encode(result["ttf"]).decode(),
        "preview_base64": base64.b64encode(result["preview_png"]).decode(),
        "variants": result["variants"],
        "missing": result["missing"],
        "missing_pages": result["missing_pages"],
        "warnings": result["warnings"],
    }
