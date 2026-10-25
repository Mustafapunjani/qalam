"""Read a photo or scan of a filled template: find the page, straighten it, cut out each character."""
import io

import cv2
import numpy as np
from PIL import Image, ImageOps

from . import layout as L

ARUCO = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
S = L.PX_PER_MM


class TemplateError(Exception):
    """Raised with a message that can be shown to the user as-is."""


def load_image(data):
    """Bytes or path -> grayscale numpy image, respecting the phone's rotation flag."""
    if isinstance(data, (bytes, bytearray)):
        data = io.BytesIO(data)
    try:
        im = Image.open(data)
        im = ImageOps.exif_transpose(im).convert("L")
    except Exception:
        raise TemplateError("This file isn't an image we can read. Upload a JPG or PNG photo or scan.")
    g = np.array(im)
    longest = max(g.shape)
    if longest > 3400:
        f = 3400 / longest
        g = cv2.resize(g, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    return g


def find_page(gray):
    """Detect the corner markers. Returns (page_number, homography to the straightened page)."""
    params = cv2.aruco.DetectorParameters()
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    det = cv2.aruco.ArucoDetector(ARUCO, params)
    corners, ids, _ = det.detectMarkers(gray)
    if ids is None:
        raise TemplateError("No corner squares were found. Make sure the whole page, including all four "
                            "black squares, is in the photo and in focus.")
    found = {}
    for quad, mid in zip(corners, ids.flatten()):
        page, corner = divmod(int(mid), 4)
        if page < L.PAGES:
            found.setdefault(page, {})[corner] = quad.reshape(4, 2)
    page = max(found, key=lambda p: len(found[p]))
    if len(found[page]) < 3:
        raise TemplateError(f"Only {len(found[page])} of the 4 corner squares were found. Retake the photo "
                            "with the whole page visible, flat and evenly lit.")
    src, dst = [], []
    for corner, quad in found[page].items():
        mx, my = L.MARKER_POS[corner]
        m = L.MARKER_SIZE
        src.extend(quad)
        dst.extend([(mx * S, my * S), ((mx + m) * S, my * S), ((mx + m) * S, (my + m) * S), (mx * S, (my + m) * S)])
    H, _ = cv2.findHomography(np.float32(src), np.float32(dst), cv2.RANSAC, 4.0)
    if H is None:
        raise TemplateError("The page couldn't be straightened. Try a flatter, sharper photo.")
    return page, H


def ink_mask(gray, H, threshold=0.66):
    """Straighten the page, even out the lighting and return a mask that is True where there is ink."""
    flat = cv2.warpPerspective(gray, H, (L.PAGE_W * S, L.PAGE_H * S), flags=cv2.INTER_LINEAR,
                               borderValue=255)
    paper = cv2.dilate(flat, np.ones((15, 15), np.uint8))   # remove pen strokes...
    paper = cv2.medianBlur(paper, 31)                       # ...leaving the paper's brightness
    norm = flat.astype(np.float32) / np.maximum(paper, 1).astype(np.float32)
    return norm < threshold


def _clean(crop):
    """Drop specks and leftover guide lines; keep the handwriting."""
    n, lab, stats, _ = cv2.connectedComponentsWithStats(crop.astype(np.uint8), connectivity=8)
    keep = np.zeros_like(crop)
    h, w = crop.shape
    for i in range(1, n):
        x, y, cw, ch, area = stats[i]
        if area < 20:
            continue
        if ch <= 4 and cw > 0.7 * w:      # thin full-width line: a guide that survived
            continue
        if cw <= 4 and ch > 0.7 * h:      # thin full-height line: the box edge
            continue
        keep[lab == i] = True
    return keep


def read_cells(mask, page):
    """Yield (char, variant, bitmap, baseline_row, touches_edge) for every filled box on this page."""
    inset = int(round(L.INSET * S))
    for cell in L.cells():
        if cell["page"] != page:
            continue
        x0 = int(round(cell["x"] * S)) + inset
        y0 = int(round(cell["y"] * S)) + inset
        x1 = int(round((cell["x"] + L.BOX_W) * S)) - inset
        y1 = int(round((cell["y"] + L.BOX_H) * S)) - inset
        crop = _clean(mask[y0:y1, x0:x1])
        if crop.sum() < 40:
            continue
        edge = bool(crop[:2].any() or crop[-2:].any() or crop[:, :2].any() or crop[:, -2:].any())
        yield cell["char"], cell["variant"], crop, L.BASE_Y * S - inset, edge
