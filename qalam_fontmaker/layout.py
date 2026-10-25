"""Template geometry shared by the PDF generator and the photo processor.

All positions are in millimetres, measured from the TOP-LEFT corner of an A4 page.
If you change anything here, print a fresh template: old printouts won't match.
"""

PAGE_W, PAGE_H = 210, 297
PX_PER_MM = 10            # resolution of the straightened page used for processing

# Four ArUco markers per page. Marker id = page * 4 + corner (0=TL, 1=TR, 2=BR, 3=BL)
MARKER_SIZE = 12
MARKER_POS = {0: (10, 10), 1: (188, 10), 2: (188, 275), 3: (10, 275)}

# Writing boxes
BOX_W, BOX_H = 18, 20     # one character per box
LABEL_H = 4               # strip above each box with the printed character
COL_GAP, ROW_GAP = 1, 1
COLS, ROWS = 10, 9
GRID_X, GRID_Y = 10.5, 30

# Guide lines inside a box, mm from the box top
CAP_Y = 3                 # dotted: top of capitals and tall letters
X_Y = 8                   # dashed: top of small letters
BASE_Y = 14               # solid: letters sit on this line
INSET = 0.8               # ignore this much around the box edge when reading

LOWER = "abcdefghijklmnopqrstuvwxyz"
UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
DIGITS = "0123456789"
PUNCT = ".,;:!?'\"-()/&@#%+=*_"

# How many times each character is written. More samples = more natural text.
GROUPS = [(LOWER, 3), (UPPER, 2), (DIGITS, 2), (PUNCT, 1)]

CHARSET = LOWER + UPPER + DIGITS + PUNCT
VARIANTS = {ch: n for chars, n in GROUPS for ch in chars}

PER_PAGE = COLS * ROWS


def cells():
    """Every box in the template, in order: page, position and which character goes there."""
    seq = [(ch, v) for chars, n in GROUPS for ch in chars for v in range(n)]
    out = []
    for i, (ch, v) in enumerate(seq):
        page, k = divmod(i, PER_PAGE)
        row, col = divmod(k, COLS)
        x = GRID_X + col * (BOX_W + COL_GAP)
        y = GRID_Y + row * (LABEL_H + BOX_H + ROW_GAP) + LABEL_H
        out.append({"page": page, "char": ch, "variant": v, "x": x, "y": y})
    return out


PAGES = max(c["page"] for c in cells()) + 1
