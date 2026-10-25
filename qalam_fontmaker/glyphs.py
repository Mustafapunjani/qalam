"""Trace character bitmaps into outlines and assemble a TrueType font."""
import io

import numpy as np
import potrace
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

from . import layout as L

UPM = 1000
UNITS_PER_MM = 700 / (L.BASE_Y - L.CAP_Y)      # capital height on the template = 700 font units
UNITS_PER_PX = UNITS_PER_MM / L.PX_PER_MM
PUA_START = 0xE000                              # alternates also get private codepoints for apps


def trace(bitmap, baseline_row):
    """Bitmap (True = ink) -> RecordingPen in font units, y=0 on the template baseline."""
    pad = 2
    img = np.pad(bitmap, pad)
    paths = potrace.Bitmap(~img).trace(turdsize=8, alphamax=1.0, opticurve=True, opttolerance=0.2)
    s = UNITS_PER_PX

    def pt(p):
        return ((p.x - pad) * s, (baseline_row - (p.y - pad)) * s)

    pen = RecordingPen()
    for curve in paths:
        pen.moveTo(pt(curve.start_point))
        for seg in curve.segments:
            if seg.is_corner:
                pen.lineTo(pt(seg.c))
                pen.lineTo(pt(seg.end_point))
            else:
                pen.curveTo(pt(seg.c1), pt(seg.c2), pt(seg.end_point))
        pen.closePath()
    return pen


def _glyph(rec, side_bearing):
    """Shift an outline so it starts at the side bearing; return (TT glyph, advance width)."""
    b = BoundsPen(None)
    rec.replay(b)
    if b.bounds is None:
        return None, 0
    xmin, _, xmax, _ = b.bounds
    area = AreaPen()
    rec.replay(area)
    tt = TTGlyphPen(None)
    # TrueType wants outer contours clockwise (negative area in fontTools' convention)
    qpen = Cu2QuPen(tt, max_err=1.0, reverse_direction=area.value > 0)
    rec.replay(TransformPen(qpen, (1, 0, 0, 1, side_bearing - xmin, 0)))
    return tt.glyph(), int(round(xmax - xmin + 2 * side_bearing))


def _safe_name(family):
    clean = "".join(ch for ch in family if ch.isalnum() or ch in " -_").strip() or "My Handwriting"
    return clean[:48], (clean.replace(" ", "") or "MyHandwriting")[:60]


def build_font(samples, family="My Handwriting"):
    """samples: {char: [RecordingPen, ...]} -> (ttf bytes, {char: [codepoints of each variant]})."""
    family, ps_name = _safe_name(family)
    order, cmap, glyf, adv = [".notdef", "space"], {0x20: "space", 0xA0: "space"}, {}, {}
    empty = TTGlyphPen(None).glyph()
    glyf[".notdef"], glyf["space"] = empty, empty
    variant_map, groups = {}, {2: [], 3: []}

    for idx, ch in enumerate(L.CHARSET):
        pens = samples.get(ch)
        if not pens:
            continue
        sb = 30 if ch in L.PUNCT else 45
        base = f"uni{ord(ch):04X}"
        want = max(1, L.VARIANTS[ch])
        names = [base] + [f"{base}.alt{v}" for v in range(1, want)]
        cps = [ord(ch)]
        for v, name in enumerate(names):
            g, w = _glyph(pens[v % len(pens)], sb)   # reuse samples if some boxes were left empty
            if g is None:
                g, w = empty, 300
            glyf[name], adv[name] = g, w
            order.append(name)
            if v == 0:
                cmap[ord(ch)] = name
            else:
                cp = PUA_START + idx * 4 + v
                cmap[cp] = name
                cps.append(cp)
        variant_map[ch] = cps
        if want in groups and ch.isalnum():
            groups[want].append(base)

    lower_w = [adv[f"uni{ord(c):04X}"] for c in L.LOWER if f"uni{ord(c):04X}" in adv]
    adv["space"] = int(np.median(lower_w) * 0.6) if lower_w else 300
    adv[".notdef"] = 500

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyf)
    table = fb.font["glyf"]
    metrics, ymax, ymin = {}, 900, -400
    for name in order:
        g = table[name]
        g.recalcBounds(table)
        has = g.numberOfContours != 0
        metrics[name] = (adv[name], g.xMin if has else 0)
        if has:
            ymax, ymin = max(ymax, g.yMax), min(ymin, g.yMin)
    fb.setupHorizontalMetrics(metrics)
    asc, desc = 900, -int(round((L.BOX_H - L.BASE_Y) * UNITS_PER_MM))
    fb.setupHorizontalHeader(ascent=asc, descent=desc, lineGap=120)
    fb.setupNameTable({"familyName": family, "styleName": "Regular", "psName": ps_name + "-Regular",
                       "uniqueFontIdentifier": f"Qalam:{ps_name}", "version": "Version 1.000"})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=desc, sTypoLineGap=120,
                usWinAscent=int(ymax) + 20, usWinDescent=int(-ymin) + 20,
                sxHeight=int((L.BASE_Y - L.X_Y) * UNITS_PER_MM), sCapHeight=700, fsType=0)
    fb.setupPost()

    # Contextual alternates: repeated letters rotate through the different samples,
    # so "letter" doesn't show two identical t's. Works in browsers and in Word.
    fea = _calt(groups)
    if fea:
        fb.addOpenTypeFeatures(fea)

    out = io.BytesIO()
    fb.save(out)
    return out.getvalue(), variant_map


def _calt(groups):
    a, b = groups[3], groups[2]
    if not a and not b:
        return ""
    base_all = a + b
    alt1_all = [f"{n}.alt1" for n in base_all]
    lines = [f"@CTX_BASE = [{' '.join(base_all)}];", f"@CTX_ALT1 = [{' '.join(alt1_all)}];"]
    rules = []
    if a:
        lines += [f"@A0 = [{' '.join(a)}];", f"@A1 = [{' '.join(n + '.alt1' for n in a)}];",
                  f"@A2 = [{' '.join(n + '.alt2' for n in a)}];"]
        rules += ["    sub @CTX_BASE @A0' by @A1;", "    sub @CTX_ALT1 @A0' by @A2;"]
    if b:
        lines += [f"@B0 = [{' '.join(b)}];", f"@B1 = [{' '.join(n + '.alt1' for n in b)}];"]
        rules += ["    sub @CTX_BASE @B0' by @B1;"]
    lines += ["lookup CYCLE {", *rules, "} CYCLE;", "feature calt { lookup CYCLE; } calt;"]
    return "\n".join(lines)
