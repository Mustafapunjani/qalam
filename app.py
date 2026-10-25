"""
Qalam website: the text-to-handwriting converter plus the handwriting font maker.

Run locally:   python app.py            (then open http://localhost:5000)
Production:    gunicorn app:app --workers 2 --timeout 120
"""
import io
import os
import threading
import time
from collections import defaultdict, deque
from datetime import date

from flask import Flask, Response, jsonify, render_template, request, send_file, url_for
from werkzeug.middleware.proxy_fix import ProxyFix

from qalam_fontmaker import TemplateError, make_template_pdf
from qalam_fontmaker import make_font as build_font
from qalam_fontmaker.pipeline import to_json

# Static files live in public/static so Vercel can serve them from its CDN;
# locally (and on Render) Flask serves the same folder at /static.
app = Flask(__name__, static_folder="public/static", static_url_path="/static")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)   # correct IPs/https behind Render's proxy

SITE_NAME = os.environ.get("SITE_NAME", "Qalam")
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "hello@example.com")
POLICY_UPDATED = "25 October 2026"           # change when you edit the privacy policy or terms
FONTS_PER_HOUR = int(os.environ.get("FONTS_PER_HOUR", "10"))

app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024
TEMPLATE_PDF = make_template_pdf()


@app.context_processor
def site_globals():
    return {"site_name": SITE_NAME, "contact_email": CONTACT_EMAIL,
            "year": date.today().year, "updated": POLICY_UPDATED}


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    if request.path.startswith("/static/"):
        resp.headers.setdefault("Cache-Control", "public, max-age=3600")
    return resp


# ---------- Pages ----------
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/make-font")
def make_font():
    return render_template("make_font.html")


@app.get("/about")
def about():
    return render_template("about.html")


@app.get("/privacy")
def privacy():
    return render_template("privacy.html")


@app.get("/terms")
def terms():
    return render_template("terms.html")


@app.get("/contact")
def contact():
    return render_template("contact.html")


@app.get("/template.pdf")
def template_pdf():
    return send_file(io.BytesIO(TEMPLATE_PDF), mimetype="application/pdf",
                     download_name="handwriting-template.pdf")


# ---------- Font API ----------
_hits = defaultdict(deque)
_hits_lock = threading.Lock()


def rate_limited(ip):
    """Allow FONTS_PER_HOUR builds per IP address (per server process)."""
    now = time.time()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= FONTS_PER_HOUR:
            return True
        q.append(now)
        return False


@app.post("/api/font")
def api_font():
    files = [f for f in request.files.getlist("pages") if f and f.filename]
    if not files:
        return jsonify(error="Choose at least one photo of a filled template page."), 400
    if len(files) > 6:
        return jsonify(error="Upload at most 6 photos at a time."), 400
    if rate_limited(request.remote_addr or "unknown"):
        return jsonify(error="You’ve made a lot of fonts in the last hour. Please try again later."), 429
    name = (request.form.get("name") or "My Handwriting").strip()[:48]
    try:
        result = build_font([f.read() for f in files], name)
    except TemplateError as e:
        return jsonify(error=str(e)), 422
    except Exception:
        app.logger.exception("font build failed")
        return jsonify(error="Something went wrong while building the font. Try a clearer photo."), 500
    return jsonify(to_json(result))


# ---------- Search engines and monitoring ----------
@app.get("/robots.txt")
def robots():
    body = f"User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: {url_for('sitemap', _external=True)}\n"
    return Response(body, mimetype="text/plain")


@app.get("/sitemap.xml")
def sitemap():
    pages = ["index", "make_font", "about", "privacy", "terms", "contact"]
    urls = "".join(f"<url><loc>{url_for(p, _external=True)}</loc></url>" for p in pages)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
    return Response(xml, mimetype="application/xml")


@app.get("/healthz")
def healthz():
    return "ok"


@app.errorhandler(404)
def not_found(_):
    return render_template("404.html"), 404


@app.errorhandler(413)
def too_big(_):
    return jsonify(error="Those files are too large. Keep the total under 40 MB."), 413


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
