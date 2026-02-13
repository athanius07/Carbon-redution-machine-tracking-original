
# Carbon/Zero-Emission Equipment Monitor (GitHub Pages + weekly scrape)

This repo crawls OEM/news/product pages weekly, extracts signals (Battery / Hybrid / Hydrogen / Methanol/Other) and specs (kW, m³, tons, **model_number** when found), and publishes:

- `data/machines.csv`
- `data/machines.json`
- a static viewer in `webapp/` (works on GitHub Pages) with a **Download CSV** button.

## How it works
- Seeds in `config/sources.yaml` list OEM start URLs.
- The crawler (`scraper/scrape.py`) visits same-domain links up to a small depth, filters by keywords, and extracts fields. Missing fields are left **blank**.
- A GitHub Actions workflow (`.github/workflows/scrape.yml`) runs **weekly** and commits changes.

## Local run (optional)
```bash
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r scraper/requirements.txt
python scraper/scrape.py
```

## GitHub Pages
Enable GitHub Pages for the repository and point it to the branch you push (usually `main`). Then browse to `/webapp/index.html`.

### Normalized fields
- `engine_kw`: Engine or motor power in kW (hp auto-converted).
- `tonnage_t`: Operating weight / class in metric tonnes.
- `bucket_m3`: Bucket capacity in m³ (yd³ & liters converted).
- `blade_w_m`, `blade_h_m`: Grader moldboard width/height in meters.
- `blade`: Human-readable blade string for display.
