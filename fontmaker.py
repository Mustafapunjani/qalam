"""
Command-line use.

    python fontmaker.py template                       # writes template.pdf to print
    python fontmaker.py build page1.jpg page2.jpg --name "Mustafa Hand" --out my_font
"""
import argparse
import json
import os
import sys

from qalam_fontmaker import TemplateError, make_font, make_template_pdf


def main():
    ap = argparse.ArgumentParser(description="Turn your handwriting into a font.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("template", help="create the printable template")
    t.add_argument("-o", "--out", default="template.pdf")
    b = sub.add_parser("build", help="build a font from photos of the filled template")
    b.add_argument("images", nargs="+", help="one photo or scan per template page")
    b.add_argument("--name", default="My Handwriting", help="font name")
    b.add_argument("--out", default="my_font", help="output folder")
    b.add_argument("--threshold", type=float, default=0.66,
                   help="ink sensitivity: raise (e.g. 0.75) for a faint pen, lower for smudgy photos")
    a = ap.parse_args()

    if a.cmd == "template":
        with open(a.out, "wb") as f:
            f.write(make_template_pdf())
        print(f"Template saved to {a.out}. Print it at 100% scale (not 'fit to page').")
        return

    try:
        r = make_font(a.images, a.name, a.threshold)
    except TemplateError as e:
        sys.exit(f"Couldn't make the font: {e}")
    os.makedirs(a.out, exist_ok=True)
    base = "".join(ch for ch in a.name if ch.isalnum()) or "MyHandwriting"
    paths = {"font": os.path.join(a.out, base + ".ttf"), "preview": os.path.join(a.out, "preview.png"),
             "variants": os.path.join(a.out, "variants.json")}
    with open(paths["font"], "wb") as f:
        f.write(r["ttf"])
    with open(paths["preview"], "wb") as f:
        f.write(r["preview_png"])
    with open(paths["variants"], "w", encoding="utf-8") as f:
        json.dump(r["variants"], f, ensure_ascii=False, indent=1)
    print(f"Font saved to {paths['font']}")
    print(f"Preview saved to {paths['preview']}")
    if r["missing_pages"]:
        print("Pages not uploaded:", ", ".join(map(str, r["missing_pages"])))
    if r["missing"]:
        print("Characters not found:", " ".join(r["missing"]))
    for w in r["warnings"]:
        print("Note:", w)


if __name__ == "__main__":
    main()
