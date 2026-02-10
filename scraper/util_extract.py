import re, json
from typing import Optional
from bs4 import BeautifulSoup

# --- Power detection families ---
POWER_PATTERNS = [
    ("Hydrogen", r"\b(hydrogen|fuel[- ]?cell|h2)\b"),
    ("Hybrid",   r"\b(hybrid|e[- ]?drive)\b"),
    ("Battery",  r"\b(battery|bev|all-?electric|zero[- ]?emission)\b"),
    ("Methanol/Other", r"\b(methanol|ethanol|bio[- ]?fuel)\b"),
]

# --- Core spec regexes ---
KW_RX       = re.compile(r"\b(\d{2,4})\s?kW\b", re.I)
M3_RX       = re.compile(r"\b(\d+(?:\.\d+)?)\s?m(?:\^?3|3)\b", re.I)
TON_RX      = re.compile(r"\b(\d+(?:\.\d+)?)\s?(?:t|tons?)\b", re.I)
PAYLOAD_RX  = re.compile(r"\b(\d+(?:\.\d+)?)\s?(?:t|tons?)\s?(payload)\b", re.I)
BLADE_RX    = re.compile(r"\b(?:blade)\s*(?:width|size)?[:\s-]*([0-9.,xX ]+(?:mm|cm|m|ft|in))\b", re.I)

# Model numbers: allow letters/digits/hyphens; try hints and headings
MODEL_HINT_RX  = re.compile(r"(?:model|type|series|code|型番|モデル)[:\s\-]*([A-Z0-9][A-Z0-9\-]{1,})", re.I)
MODEL_H1_RX    = re.compile(r"\b([A-Z]{1,5}[0-9]{1,4}[A-Z0-9\-]*)\b")

TYPE_CANDIDATES = [
    ("Excavator",    r"\bexcavator(s)?\b"),
    ("Wheel loader", r"\bwheel\s*loader(s)?\b"),
    ("Bulldozer",    r"\b(bulldozer|dozer)(s)?\b"),
    ("Grader",       r"\bgrader(s)?\b"),
    ("Dump truck",   r"\b(dump|haul|mining)\s*truck(s)?\b"),
    ("Backhoe",      r"\bbackhoe(\s*loader)?\b"),
]

def _detect_power(text:str)->str:
    low=text.lower()
    for label, rx in POWER_PATTERNS:
        if re.search(rx, low): return label
    return ""

def _detect_type(text:str, default_hint:str="")->str:
    low=text.lower()
    for label, rx in TYPE_CANDIDATES:
        if re.search(rx, low): return label
    return default_hint or ""

def _try_json_ld(soup: Optional[BeautifulSoup]) -> dict:
    """Look for schema.org Product blocks (some OEMs publish specs there)."""
    data = {}
    if not soup: return data
    for node in soup.find_all("script", {"type":"application/ld+json"}):
        try:
            j = json.loads(node.string or "{}")
        except Exception:
            continue
        def merge(jd: dict):
            name = jd.get("name") or jd.get("model") or jd.get("sku")
            if name and not data.get("model_number"):
                data["model_number"] = str(name).strip()
            for prop in (jd.get("additionalProperty") or []):
                try:
                    k = (prop.get("name") or "").lower()
                    v = str(prop.get("value") or "")
                    if "kw" in v.lower() and not data.get("engine_power_kw"):
                        m = KW_RX.search(v); 
                        if m: data["engine_power_kw"] = m.group(1)
                    if ("bucket" in k or "capacity" in k) and not data.get("bucket_size_m3"):
                        m = M3_RX.search(v); 
                        if m: data["bucket_size_m3"] = m.group(1)
                except Exception:
                    pass
        if isinstance(j, list):
            for it in j: 
                if isinstance(it, dict): merge(it)
        elif isinstance(j, dict):
            merge(j)
    return data

def extract_all(text: str, soup: Optional[BeautifulSoup], type_hint: str="") -> dict:
    out = {
        "power": _detect_power(text),
        "type":  _detect_type(text, type_hint),
        "engine_power_kw": "",
        "bucket_size_m3": "",
        "class_tons": "",
        "blade_size": "",
        "model_number": "",
        "year_of_release": ""
    }

    # JSON‑LD (may fill model/kw/bucket)
    ld = _try_json_ld(soup)
    for k,v in ld.items(): 
        out[k] = v

    # Heading often contains model
    if soup and not out["model_number"]:
        h1 = soup.find(["h1","h2","h3"])
        if h1 and h1.get_text(strip=True):
            m = MODEL_H1_RX.search(h1.get_text(strip=True))
            if m: out["model_number"] = m.group(1)

    # Regex fallbacks on the full text
    m = KW_RX.search(text);      out["engine_power_kw"] = out["engine_power_kw"] or (m.group(1) if m else "")
    m = M3_RX.search(text);      out["bucket_size_m3"]  = out["bucket_size_m3"]  or (m.group(1) if m else "")
    m = PAYLOAD_RX.search(text) or TON_RX.search(text)
    if not out["class_tons"] and m: out["class_tons"] = m.group(1)
    m = BLADE_RX.search(text);   out["blade_size"]      = out["blade_size"]      or (m.group(1) if m else "")
    m = MODEL_HINT_RX.search(text)
    if not out["model_number"] and m: out["model_number"] = m.group(1).strip("-")

    # Year (prefer 2000+)
    year = re.search(r"\b(20\d{2})\b", text)
    if year: out["year_of_release"] = year.group(1)
    return out
