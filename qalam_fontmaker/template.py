"""Generate the printable handwriting template (PDF)."""
import io

import cv2
from reportlab.lib.colors import Color
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from . import layout as L

ARUCO = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
GUIDE = Color(0.70, 0.82, 0.95)       # light blue: disappears when the photo is processed
GUIDE_SOFT = Color(0.80, 0.88, 0.97)
LABEL = Color(0.40, 0.42, 0.47)


def _y(top_mm):
    """Convert 'mm from top' to ReportLab's 'points from bottom'."""
    return (L.PAGE_H - top_mm) * mm


def _marker(c, marker_id, x, y):
    bits = cv2.aruco.generateImageMarker(ARUCO, marker_id, 6, borderBits=1)  # 6x6 cells
    cell = L.MARKER_SIZE / 6
    c.setFillColorRGB(0, 0, 0)
    for r in range(6):
        for col in range(6):
            if bits[r, col] < 128:
                c.rect((x + col * cell) * mm, _y(y + (r + 1) * cell), cell * mm + 0.05, cell * mm + 0.05,
                       stroke=0, fill=1)


def make_template_pdf():
    """Return the template as PDF bytes."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(L.PAGE_W * mm, L.PAGE_H * mm))
    c.setTitle("Qalam handwriting template")
    all_cells = L.cells()
    for page in range(L.PAGES):
        for corner, (mx, my) in L.MARKER_POS.items():
            _marker(c, page * 4 + corner, mx, my)

        c.setFillColorRGB(0.1, 0.12, 0.16)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(26 * mm, _y(15), f"Qalam handwriting template, page {page + 1} of {L.PAGES}")
        c.setFont("Helvetica", 7.5)
        c.setFillColor(LABEL)
        tip = ("Write one character in each box with a dark pen (black or dark blue). Letters sit on the solid line, "
               "capitals and tall letters reach the dotted line, small letters reach the dashed line.")
        for i, line in enumerate(simpleSplit(tip, "Helvetica", 7.5, 158 * mm)):
            c.drawString(26 * mm, _y(19.5 + i * 3.2), line)
        foot = ("Keep all four black squares in the photo or scan. Don't write on them or fold the page. "
                "Light blue lines are removed automatically.")
        for i, line in enumerate(simpleSplit(foot, "Helvetica", 7.5, 158 * mm)):
            c.drawString(26 * mm, _y(279 + i * 3.2), line)

        for cell in (k for k in all_cells if k["page"] == page):
            x, y = cell["x"], cell["y"]
            # label strip
            c.setFillColor(LABEL)
            c.setFont("Helvetica", 8)
            label = cell["char"]
            if len([k for k in all_cells if k["char"] == label]) > 1:
                label = f"{label}  {cell['variant'] + 1}"
            c.drawCentredString((x + L.BOX_W / 2) * mm, _y(y - 1.1), label)
            # box and guides
            c.setStrokeColor(GUIDE)
            c.setLineWidth(0.6)
            c.setDash()
            c.rect(x * mm, _y(y + L.BOX_H), L.BOX_W * mm, L.BOX_H * mm, stroke=1, fill=0)
            c.setLineWidth(0.8)
            c.line(x * mm, _y(y + L.BASE_Y), (x + L.BOX_W) * mm, _y(y + L.BASE_Y))
            c.setStrokeColor(GUIDE_SOFT)
            c.setLineWidth(0.5)
            c.setDash(2, 1.5)
            c.line(x * mm, _y(y + L.X_Y), (x + L.BOX_W) * mm, _y(y + L.X_Y))
            c.setDash(0.6, 1.6)
            c.line(x * mm, _y(y + L.CAP_Y), (x + L.BOX_W) * mm, _y(y + L.CAP_Y))
            c.setDash()
        c.showPage()
    c.save()
    return buf.getvalue()
