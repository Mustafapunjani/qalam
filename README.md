# Qalam website

A text-to-handwriting converter plus a font maker that turns a photo of your
handwriting into a real font, as one Flask app ready to deploy.

## What's inside

| Path | What it is |
|---|---|
| `app.py` | The web server: pages, the font API, robots.txt, sitemap, rate limiting |
| `templates/` | Page HTML. `base.html` has the header and footer shared by every page |
| `public/static/js/converter.js` | The converter: layout, realistic rendering, PDF/PNG downloads, font upload |
| `public/static/js/make-font.js` | The font maker page: shrinks photos, uploads, previews, sends the font to the converter |
| `public/static/css/site.css` | All styles, with light and dark mode |
| `qalam_fontmaker/` | Template PDF, photo reading (OpenCV), tracing (Potrace), font building (fontTools) |
| `fontmaker.py` | Command-line version of the font maker |
| `tools/make_test_photo.py` | Makes fake phone photos of a filled template, for testing without a printer |
| `tests/` | Automated tests, including a full photo-to-font run |
| `vercel.json` | Deployment settings for Vercel |
| `render.yaml` | Deployment settings for Render |

## Run it on your computer

Windows (Command Prompt):
```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
python app.py
```
Mac/Linux: same, but activate with `source .venv/bin/activate`.

Open http://localhost:5000. Run the tests with `pytest`.

## Put it online on Vercel (free)

1. **Put the code on GitHub** (see step 1 of the Render section below).
2. Sign up at vercel.com with your GitHub account, click **Add New > Project**, and import the
   repository. Vercel detects Flask from `requirements.txt` and `app.py`; you don't set any
   build command.
3. Before clicking **Deploy**, open **Environment Variables** and add `CONTACT_EMAIL` (and
   `SITE_NAME` if you've renamed the site).
4. Deploy. You get an address like `qalam.vercel.app`. Every `git push` redeploys, and every
   branch gets its own preview link.

How the project fits Vercel's rules:
- **Static files** are in `public/static`, which Vercel serves from its CDN at `/static/...`.
  Locally, Flask serves the same folder, so nothing changes when you run `python app.py`.
- **Uploads are limited to 4.5 MB per request** on Vercel. The font maker page resizes and
  recompresses photos in the browser first (two 29 MB test photos were sent as 1.85 MB total),
  so users never hit the limit.
- **Package size:** OpenCV, NumPy and the rest come to roughly 250 MB installed, inside
  Vercel's 500 MB limit for Python. `vercel.json` keeps tests and tools out of the bundle.
- **Rate limiting** counts per server instance. Vercel runs several instances as traffic grows,
  so the 10-per-hour limit is looser there. That's fine to start; add a shared store like
  Upstash Redis later if someone abuses it.
- The first font after a quiet period can take a few extra seconds while the function starts.

## Or put it online on Render (free)

1. **Put the code on GitHub.** Create an empty repository on github.com, then in this folder:
   ```
   git init
   git add .
   git commit -m "First version of Qalam"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/qalam.git
   git push -u origin main
   ```
   (GitHub Desktop works too if you prefer buttons.)
2. **Create the service on Render.** Sign up at render.com with your GitHub account, choose
   **New > Blueprint**, and pick your repository. Render reads `render.yaml` and asks for
   `CONTACT_EMAIL`. Enter the email you want shown on the contact and privacy pages.
3. **Wait for the first build** (a few minutes). You'll get an address like
   `qalam-xxxx.onrender.com`. Open it and test everything, including a real handwriting photo.
4. **Updates are automatic.** Every `git push` to `main` redeploys the site.

On the free plan the site sleeps after a while without visitors, and the next visit takes up to
a minute to wake it. Switch to a paid plan once real people are using it.

## Your own domain

Buy a domain from any registrar. In Render, open the service and go to **Settings > Custom
Domains**, add the domain, then copy the DNS records Render shows into your registrar's DNS
settings. HTTPS is set up automatically.

Then add the site to **Google Search Console** and submit `https://yourdomain.com/sitemap.xml`
so Google finds your pages.

## Things to edit before launch

- **Name:** `SITE_NAME` in `render.yaml` changes the name everywhere on the site.
- **About page:** `templates/about.html` is written as a starting point. Make it yours.
- **Policies:** if you change `privacy.html` or `terms.html`, update `POLICY_UPDATED` in `app.py`.
- **Ads or analytics:** when you add Google AdSense or analytics, update the "Third-party
  services" section of the privacy policy. They use cookies, and AdSense requires you to say so.
- **Rate limit:** `FONTS_PER_HOUR` (default 10 per visitor) can be set as an environment variable.

## Tuning the font maker

- Faint pen or overexposed photos: raise the ink threshold (the `threshold` argument of
  `make_font`, default 0.66) to about 0.72–0.78.
- Shadows or dirty paper showing up as ink: lower it to about 0.6.
- Template measurements live in `qalam_fontmaker/layout.py`. If you change them, everyone needs
  a freshly printed template.
