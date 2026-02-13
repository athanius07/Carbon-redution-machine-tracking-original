#!/usr/bin/env python3
# scraper/scrape.py

import re
import json
import time
import csv
from pathlib import Path

import yaml
import requests
from bs4 import BeautifulSoup

DATA_DIR = Path("data")
CONFIG_PATH = Path("config/source.yaml")
CSV_PATH = DATA_DIR / "machines.csv"
JSON_PATH = DATA_DIR / "machines.json"
USER_AGENT = "Mozilla/5.0 (compatible; Carbon-Reduction-Monitor/1.0)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en"})

# ---------- Unit conversions ----------
HP_TO_KW = 0.7457
FT_TO_M = 0.3048
IN_TO_M = 0.0254
MM_TO_M = 0.001
YD3_TO_M3 = 0.764555

num_re = r"(\d+(?:[.,]\d+)?)"

def _to_float(s):
    if s is None:
        return None
    s = str(s).strip().replace(",", "")
    try:
        return float(s)
    except Exception:
        return None

def to_kw(val, unit):
    v = _to_float(val)
    if v is None: return None
    unit = unit.lower()
    if unit in ("kw",):
        return v
    if unit in ("hp",):
        return round(v * HP_TO_KW, 3)
    return None

def to_tonnes(val, unit):
    v = _to_float(val)
    if v is None: return None
    unit = unit.lower()
    if unit in ("t", "ton", "tons", "tonne", "tonnes"):
        return v
    if unit in ("kg",):
        return round(v / 1000.0, 3)
    if unit in ("lb", "lbs", "pound", "pounds"):
        return round(v * 0.000453592, 3)
    return None

def to_m3(val, unit):
    v = _to_float(val)
    if v is None: return None
    unit = unit.lower()
    if unit in ("m3", "m³"):
        return v
    if unit in ("yd3", "yd³", "cu yd", "cuyd", "yd^3", "cu. yd"):
        return round(v * YD3_TO_M3, 3)
    if unit in ("l", "litre", "liter", "liters", "litres"):
        return round(v / 1000.0, 3)
    return None

def to_m(val, unit):
    v = _to_float(val)
    if v is None: return None
    unit = unit.lower()
    if unit in ("m",):
        return v
    if unit in ("mm",):
        return round(v * MM_TO_M, 4)
    if unit in ("ft", "feet"):
        return round(v * FT_TO_M, 4)
    if unit in ("in", "inch", "inches"):
        return round(v * IN_TO_M, 4)
    return None

# ---------- Regex patterns (fallbacks) ----------
RE_ENGINE = re.compile(rf"{num_re}\s*(kW|KW|hp|HP)\b")
RE_TONNAGE = re.compile(rf"(?:operating\s+weight|class|tonnage)?.*?{num_re}\s*(t|ton(?:ne)?s?|kg|lb|lbs)\b", re.I)
RE_BUCKET = re.compile(rf"{num_re}\s*(m3|m³|yd3|yd³|cu\.?\s*yd|cuyd|l|lit(?:re|er)s?)\b", re.I)
RE_BLADE_DIM = re.compile(rf"{num_re}\s*(mm|m|ft|in)\s*[x×]\s*{num_re}\s*(mm|m|ft|in)", re.I)
RE_BLADE_WIDTH = re.compile(rf"(?:moldboard|blade).*?(?:width|W)\s*[:\-]?\s*{num_re}\s*(mm|m|ft|in)", re.I)

def clean_text(text):
    return re.sub(r"\s+", " ", text or "").strip()

def get_html(url):
    resp = SESSION.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text

def from_selector(soup, selector):
    """
    Supports SoupSieve selectors. Prefer ':-soup-contains("Text")' over ':contains()'.
    """
    try:
        node = soup.select_one(selector)
        if node:
            return clean_text(node.get_text(" ", strip=True))
    except Exception:
        return None
    return None

def extract_specs_from_text(text, equipment_type):
    """
    Regex-based extraction from free text.
    Returns normalized dict + raw matches.
    """
    normalized = {
        "engine_kw": None,
        "tonnage_t": None,
        "bucket_m3": None,
        "blade_w_m": None,
        "blade_h_m": None,
    }
    raw = {}

    # Engine
    m = RE_ENGINE.search(text)
    if m:
        val = m.group(1)
        unit = m.group(2)
        normalized["engine_kw"] = to_kw(val, unit)
        raw["engine_power_raw"] = f"{val} {unit}"

    # Tonnage / Operating weight / Class
    m = RE_TONNAGE.search(text)
    if m:
        val = m.group(1)
        unit = m.group(2)
        normalized["tonnage_t"] = to_tonnes(val, unit)
        raw["tonnage_raw"] = f"{val} {unit}"

    # Bucket (excavators / wheel loaders)
    eq = (equipment_type or "").lower()
    if eq.startswith("excavator") or eq.startswith("wheel"):
        m = RE_BUCKET.search(text)
        if m:
            val = m.group(1)
            unit = m.group(2)
            normalized["bucket_m3"] = to_m3(val, unit)
            raw["bucket_raw"] = f"{val} {unit}"

    # Blade (graders)
    if eq.startswith("grader"):
        m = RE_BLADE_DIM.search(text)
        if m:
            w_val, w_unit, h_val, h_unit = m.group(1), m.group(2), m.group(3), m.group(4)
            normalized["blade_w_m"] = to_m(w_val, w_unit)
            normalized["blade_h_m"] = to_m(h_val, h_unit)
            raw["blade_raw"] = f"{w_val}{w_unit} x {h_val}{h_unit}"
        else:
            m = RE_BLADE_WIDTH.search(text)
            if m:
                w_val, w_unit = m.group(1), m.group(2)
                normalized["blade_w_m"] = to_m(w_val, w_unit)
                raw["blade_raw"] = f"{w_val}{w_unit}"

    return normalized, raw

def extract_with_selectors(soup, selectors, equipment_type):
    """
    Try selectors first; then regex fallback on entire page text.
    """
    text_blob = clean_text(soup.get_text(" ", strip=True))
    normalized = {
        "engine_kw": None,
        "tonnage_t": None,
        "bucket_m3": None,
        "blade_w_m": None,
        "blade_h_m": None,
    }
    raw = {}

    if selectors:
        # ENGINE
        s = selectors.get("engine_kw")
        if s:
            val = from_selector(soup, s)
            if val:
                m = re.search(rf"{num_re}\s*(kW|KW|hp|HP)", val)
                if m:
                    normalized["engine_kw"] = to_kw(m.group(1), m.group(2))
                    raw["engine_power_raw"] = clean_text(val)

        # TONNAGE
        s = selectors.get("tonnage_t")
        if s:
            val = from_selector(soup, s)
            if val:
                m = re.search(rf"{num_re}\s*(t|ton(?:ne)?s?|kg|lb|lbs)", val, re.I)
                if m:
                    normalized["tonnage_t"] = to_tonnes(m.group(1), m.group(2))
                    raw["tonnage_raw"] = clean_text(val)

        # BUCKET
        s = selectors.get("bucket_m3")
        if s and (equipment_type or "").lower().startswith(("excavator", "wheel")):
            val = from_selector(soup, s)
            if val:
                m = re.search(rf"{num_re}\s*(m3|m³|yd3|yd³|cu\.?\s*yd|cuyd|l|lit(?:re|er)s?)", val, re.I)
                if m:
                    normalized["bucket_m3"] = to_m3(m.group(1), m.group(2))
                    raw["bucket_raw"] = clean_text(val)

        # BLADE
        s = selectors.get("blade")
        if s and (equipment_type or "").lower().startswith("grader"):
            val = from_selector(soup, s)
            if val:
                m = RE_BLADE_DIM.search(val)
                if m:
                    normalized["blade_w_m"] = to_m(m.group(1), m.group(2))
                    normalized["blade_h_m"] = to_m(m.group(3), m.group(4))
                    raw["blade_raw"] = clean_text(val)
                else:
                    m = RE_BLADE_WIDTH.search(val)
                    if m:
                        normalized["blade_w_m"] = to_m(m.group(1), m.group(2))
                        raw["blade_raw"] = clean_text(val)

    # Fallback regex on entire page
    fallback_norm, fallback_raw = extract_specs_from_text(text_blob, equipment_type or "")
    for k, v in fallback_norm.items():
        if normalized.get(k) is None and v is not None:
            normalized[k] = v
    raw.update({k: v for k, v in fallback_raw.items() if v})

    return normalized, raw

def load_yaml_sources():
    if not CONFIG_PATH.exists():
        return []
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    return cfg.get("sources", [])

def save_outputs(rows):
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    fieldnames = [
        "power","oem","country","class","engine_kw",
        "blade","bucket_m3","type","year","status",
        "model","link","date",
        "tonnage_t","blade_w_m","blade_h_m","raw_specs"
    ]
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})

def enrich_row(row):
    url = row.get("link")
    eq_type = row.get("type") or row.get("equipment_type") or ""
    if not url:
        return row, {}

    html = get_html(url)
    soup = BeautifulSoup(html, "html.parser")
    # Optional per‑OEM selectors (none by default)
    selectors = row.get("_selectors", {})  # allows per-row selectors if you want
    normalized, raw = extract_with_selectors(soup, selectors, eq_type)

    # Build blade display string
    blade_str = None
    if normalized["blade_w_m"] and normalized["blade_h_m"]:
        blade_str = f"{normalized['blade_w_m']}m × {normalized['blade_h_m']}m"
    elif normalized["blade_w_m"]:
        blade_str = f"{normalized['blade_w_m']}m"

    # Merge back
    out = dict(row)
    out["engine_kw"] = normalized["engine_kw"] if normalized["engine_kw"] is not None else row.get("engine_kw")
    out["bucket_m3"] = normalized["bucket_m3"] if normalized["bucket_m3"] is not None else row.get("bucket_m3")
    out["tonnage_t"] = normalized["tonnage_t"] if normalized["tonnage_t"] is not None else row.get("tonnage_t")
    out["blade_w_m"] = normalized["blade_w_m"] if normalized["blade_w_m"] is not None else row.get("blade_w_m")
    out["blade_h_m"] = normalized["blade_h_m"] if normalized["blade_h_m"] is not None else row.get("blade_h_m")
    out["blade"] = blade_str or row.get("blade")
    # Always refresh 'date' as run date if missing
    out["date"] = out.get("date") or time.strftime("%Y-%m-%d")

    raw_prev = {}
    try:
        raw_prev = json.loads(row.get("raw_specs") or "{}")
    except Exception:
        pass
    out["raw_specs"] = json.dumps({**raw_prev, **raw}, ensure_ascii=False)

    return out, raw

def main():
    rows = []

    # 1) Enrich existing data if present
    if JSON_PATH.exists():
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            existing = json.load(f)
        print(f"Loaded {len(existing)} existing rows; enriching from 'link' pages…")
        for r in existing:
            try:
                enriched, _ = enrich_row(r)
                rows.append(enriched)
            except Exception as e:
                r_out = dict(r)
                r_out.setdefault("raw_specs", f"error: {e}")
                rows.append(r_out)
    else:
        print("No existing JSON; starting from config sources only.")

    # 2) Optional: union with sources from YAML
    sources = load_yaml_sources()
    for src in sources:
        # Only add entries that are not already in rows by the same URL
        url = src.get("url")
        if not url:
            continue
        if any((row.get("link") == url) for row in rows):
            continue
        # Seed a minimal row and enrich it
        seed_row = {
            "power": src.get("power", ""),
            "oem": src.get("oem", ""),
            "country": src.get("country", ""),
            "class": src.get("class", ""),
            "type": src.get("equipment_type") or src.get("type", ""),
            "status": src.get("status", "HTML"),
            "year": src.get("year", ""),
            "model": src.get("model", ""),
            "link": url,
            "date": time.strftime("%Y-%m-%d"),
            "_selectors": src.get("selectors", {})
        }
        try:
            enriched, _ = enrich_row(seed_row)
            rows.append(enriched)
        except Exception as e:
            seed_row["raw_specs"] = f"error: {e}"
            rows.append(seed_row)

    save_outputs(rows)
    print(f"Saved {len(rows)} rows to {CSV_PATH} and {JSON_PATH}")

if __name__ == "__main__":
    main()
