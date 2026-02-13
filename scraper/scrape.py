
import csv, json, re, time, os, sys, yaml
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(__file__))
CFG  = os.path.join(ROOT, 'config', 'sources.yaml')
OUT_CSV = os.path.join(ROOT, 'data', 'machines.csv')
OUT_JSON= os.path.join(ROOT, 'data', 'machines.json')

HEADERS={'User-Agent':'CarbonEquipmentBot/1.0 (+contact: you@example.com)'}

FIELDS=[
 'power','oem','country','class_tons','engine_power_kw','blade_size','bucket_size_m3',
 'type','year_of_release','development_status','model_number','link','link_date','last_seen_utc'
]

KEYWORDS=[
 'carbon','hydrogen','battery','hybrid','electric','zero emission','mining','construction','low-emission','zero-emission'
]

# Regex helpers
KW_RX     = re.compile(r"(\d{2,4})\s?kW", re.I)
M3_RX     = re.compile(r"(\d+(?:\.\d+)?)\s?m(?:\^?3|3)", re.I)
TON_RX    = re.compile(r"(\d+(?:\.\d+)?)\s?(?:t|tons?)", re.I)
YEAR_RX   = re.compile(r"(20\d{2}|19\d{2})")
MODEL_RX  = re.compile(r"(?:model|type|series|code|型番|モデル)[:\s\-]*([A-Z0-9][A-Z0-9\-]{1,})", re.I)

TYPE_WORDS=[('Excavator','excavator'),('Wheel loader','wheel loader'),('Bulldozer','bulldozer|dozer'),('Grader','grader'),('Dump truck','dump truck|haul truck|mining truck'),('Backhoe','backhoe')]


def detect_power(text:str)->str:
    low=text.lower()
    if re.search(r"hydrogen|fuel[- ]?cell|h2", low): return 'Hydrogen'
    if re.search(r"hybrid|e[- ]?drive", low): return 'Hybrid'
    if re.search(r"battery|bev|all-?electric|zero[- ]?emission", low): return 'Battery'
    if re.search(r"methanol|ethanol|bio[- ]?fuel", low): return 'Methanol/Other'
    return ''


def detect_type(text:str, default_hint:str='')->str:
    low=text.lower()
    for label,rx in TYPE_WORDS:
        if re.search(rx, low):
            return label
    return default_hint or ''


def fetch(url:str, timeout=20)->str:
    try:
        r=requests.get(url, headers=HEADERS, timeout=timeout)
        if r.status_code==200:
            return r.text
    except Exception as e:
        print('  ! fetch error', url, e)
    return ''


def same_domain(u:str, root:str)->bool:
    try:
        return urlparse(u).netloc.split(':')[0]==urlparse(root).netloc.split(':')[0]
    except:
        return False


def extract(text:str, seed:dict, url:str)->dict:
    row={k:'' for k in FIELDS}
    row['oem']=seed.get('oem','')
    row['country']=seed.get('country','')
    row['type']=detect_type(text, seed.get('type_hint',''))
    row['power']=detect_power(text)
    m=KW_RX.search(text); row['engine_power_kw']=m.group(1) if m else ''
    m=M3_RX.search(text); row['bucket_size_m3']=m.group(1) if m else ''
    m=TON_RX.search(text); row['class_tons']=m.group(1) if m else ''
    m=YEAR_RX.search(text); row['year_of_release']=m.group(1) if m else ''
    m=MODEL_RX.search(text); row['model_number']=m.group(1).strip('-') if m else ''
    row['development_status']=seed.get('development_status','')
    row['link']=url
    row['link_date']=''
    row['last_seen_utc']=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return row


def ensure_outputs():
    os.makedirs(os.path.join(ROOT,'data'), exist_ok=True)
    if not os.path.exists(OUT_CSV):
        with open(OUT_CSV,'w',encoding='utf-8',newline='') as f:
            csv.writer(f).writerow(FIELDS)


def load_existing()->list[dict]:
    if not os.path.exists(OUT_CSV): return []
    with open(OUT_CSV,'r',encoding='utf-8',newline='') as f:
        return list(csv.DictReader(f))


def save_all(rows:list[dict]):
    with open(OUT_CSV,'w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    with open(OUT_JSON,'w',encoding='utf-8') as f:
        json.dump(rows,f,ensure_ascii=False,indent=2)


def upsert(existing, new_rows):
    key=lambda r:(r.get('oem',''), r.get('model_number',''), r.get('link',''))
    idx={key(r):i for i,r in enumerate(existing)}
    out=existing[:]
    for r in new_rows:
        k=key(r)
        if k in idx:
            out[idx[k]]=r
        else:
            out.append(r)
    return out


def main():
    ensure_outputs()
    with open(CFG,'r',encoding='utf-8') as f:
        cfg=yaml.safe_load(f) or {}
    seeds=cfg.get('seeds',[])

    existing=load_existing()
    new_rows=[]

    for seed in seeds:
        start_urls=[u for u in seed.get('start_urls',[]) if u]
        for start in start_urls:
            print('Seed:', seed.get('oem'), start)
            root=start
            html=fetch(start)
            if not html: continue
            soup=BeautifulSoup(html,'html.parser')
            links=set()
            for a in soup.find_all('a',href=True):
                u=urljoin(start,a['href'])
                if u.startswith('mailto:') or u.startswith('javascript:'): continue
                if same_domain(u, root):
                    links.add(u)
            # limit crawl breadth
            links=list(links)[:30]

            # include start page itself
            candidates=[start]+links
            for url in candidates:
                text=fetch(url)
                if not text: continue
                low=text.lower()
                if any(k in low for k in KEYWORDS):
                    row=extract(text, seed, url)
                    # Only keep rows that have at least a power/type/kw/tons/model/link
                    if row['link']:
                        new_rows.append(row)
                time.sleep(0.2)

    merged=upsert(existing,new_rows)
    save_all(merged)
    print(f'Saved {len(merged)} rows to data/machines.csv & .json')

if __name__=='__main__':
    main()
