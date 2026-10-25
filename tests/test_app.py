"""Run with:  pip install -r requirements-dev.txt  then  pytest"""
import io
import os
import random
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from app import app  # noqa: E402


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    return app.test_client()


@pytest.mark.parametrize("path", ["/", "/make-font", "/about", "/privacy", "/terms", "/contact"])
def test_pages_load(client, path):
    r = client.get(path)
    assert r.status_code == 200
    assert b"<title>" in r.data


def test_template_is_pdf(client):
    r = client.get("/template.pdf")
    assert r.status_code == 200 and r.data.startswith(b"%PDF")


def test_seo_files(client):
    assert b"Sitemap:" in client.get("/robots.txt").data
    assert b"/make-font" in client.get("/sitemap.xml").data


def test_unknown_page_is_404(client):
    assert client.get("/nope").status_code == 404


def test_api_needs_files(client):
    assert client.post("/api/font", data={}).status_code == 400


def test_api_rejects_non_image(client):
    data = {"pages": (io.BytesIO(b"not an image"), "x.jpg")}
    r = client.post("/api/font", data=data, content_type="multipart/form-data")
    assert r.status_code == 422 and "image" in r.get_json()["error"]


def test_full_font_from_fake_photo(client):
    pdfium = pytest.importorskip("pypdfium2")
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import cv2
    from make_test_photo import S, fake_photo, fill_page
    from qalam_fontmaker import layout as L, make_template_pdf

    page = pdfium.PdfDocument(make_template_pdf())[0]
    img = page.render(scale=S * 25.4 / 72).to_pil().resize((L.PAGE_W * S, L.PAGE_H * S))
    rng = random.Random(1)
    photo = fake_photo(fill_page(img, 0, None, rng), rng)
    ok, jpg = cv2.imencode(".jpg", photo)
    data = {"pages": (io.BytesIO(jpg.tobytes()), "page1.jpg"), "name": "Test Hand"}
    r = client.post("/api/font", data=data, content_type="multipart/form-data")
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["missing_pages"] == [2]
    assert "a" in body["variants"] and len(body["variants"]["a"]) == 3
