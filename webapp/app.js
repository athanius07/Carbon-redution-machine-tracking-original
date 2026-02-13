'use strict';

// ---------- Load + normalize -------------------------------------------------
async function load() {
  try {
    // index.html and app.js are in /webapp/
    // data lives in /data/ -> go up one level
    const dataUrl = new URL('../data/machines.json', document.baseURI).href;
    console.log('Fetching data from:', dataUrl);

    const res = await fetch(dataUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Cannot load data: ${res.status} ${res.statusText}`);

    const raw = await res.json();
    let rows = Array.isArray(raw) ? raw : (raw?.rows || []);
    if (!Array.isArray(rows)) {
      console.warn('Unexpected JSON shape; got:', raw);
      rows = [];
    }

    // Normalize to classic keys used by the table and UI
    rows = rows.map(r => {
      const typeNorm = normalizeType(r.type || r.type_html || '');
      return {
        ...r,
        // normalized/alias keys used by the renderer
        class:  r.class  ?? r.class_tons       ?? r.class_t       ?? '',
        engine: r.engine ?? r.engine_power_kw  ?? r.motor_kw      ?? '',
        bucket: r.bucket ?? r.bucket_size_m3   ?? r.bucket_m3     ?? '',
        blade:  r.blade  ?? r.blade_size       ?? '',
        year:   r.year   ?? r.year_of_release  ?? r.release_year  ?? '',
        status: r.status ?? r.development_status ?? '',
        type_normalized: typeNorm
      };
    });

    console.log(`Loaded ${rows.length} machines`);
    return rows;
  } catch (err) {
    console.error('load() failed:', err);
    const el = document.getElementById('error') || document.body;
    el.insertAdjacentHTML('afterbegin',
      `<div style="color:#b00020">Data load failed: ${err.message}</div>`);
    return [];
  }
}

// ---------- Helpers ----------------------------------------------------------
function powerClass(p) {
  const k = (p || '').toLowerCase();
  if (k.includes('battery'))     return 'power-battery';
  if (k.includes('hydrogen'))    return 'power-hydrogen';
  if (k.includes('hybrid'))      return 'power-hybrid';
  if (k.includes('methanol') || k.includes('ethanol') || k.includes('other'))
    return 'power-methanol';
  return '';
}

function normalizeType(t) {
  const k = String(t || '').toLowerCase();
  if (k.includes('dump'))       return 'Dump truck';
  if (k.includes('dozer'))      return 'Bulldozer';
  if (k.includes('grader'))     return 'Grader';
  if (k.includes('loader'))     return 'Wheel loader';
  if (k.includes('excav'))      return 'Excavator';
  if (k.includes('backhoe'))    return 'Backhoe';
  // fallback: preserve original but capitalized
  return (t || '').trim() || 'Unknown';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// CSV utilities
function toCsv(rows, headers) {
  const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = headers.map(h => quote(h.title)).join(',');
  const body = rows.map(r =>
    headers.map(h => quote(h.value(r))).join(',')
  ).join('\n');
  return `${head}\n${body}`;
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Render -----------------------------------------------------------
function render(rows) {
  const checks  = [...document.querySelectorAll('.type-toggle')];
  const allowed = new Set(checks.filter(c => c.checked).map(c => c.value));
  const tbody   = document.querySelector('#equip tbody');

  if (!tbody) {
    console.error('Missing table body: #equip tbody');
    return;
  }

  // If no toggles are checked, show all
  const filtered = allowed.size
    ? rows.filter(r => allowed.has(r.type_normalized))
    : rows.slice();

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="color:#888;">No rows to display.</td></tr>`;
    return;
  }

  const html = filtered.map(r => {
    const linkHtml = r.link
      ? `<a href="${escapeHtml(r.link)}" target="_blank" rel="rn `
      <tr>
        <td><span class="power-pill ${powerClass(r.power)}">${escapeHtml(r.power || '')}</span></td>
        <td>${escapeHtml(r.oem)}</td>
        <td>${escapeHtml(r.country)}</td>
        <td>${escapeHtml(r.class)}</td>
        <td>${escapeHtml(r.engine)}</td>
        <td>${escapeHtml(r.blade)}</td>
        <td>${escapeHtml(r.bucket)}</td>
        <td>${escapeHtml(r.type_normalized)}</td>
        <td>${escapeHtml(r.year)}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${escapeHtml(r.model_number || '')}</td>
        <td class="link">${linkHtml}</td>
        <td>${escapeHtml(r.link_date || '')}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;

  // Wire CSV download for current view
  const btn = document.getElementById('downloadCsv');
  if (btn) {
    btn.onclick = () => {
      const headers = [
        { title: 'Power',          value: r => r.power || '' },
        { title: 'OEM',            value: r => r.oem || '' },
        { title: 'Country',        value: r => r.country || '' },
        { title: 'Class (t)',      value: r => r.class || '' },
        { title: 'Engine (kW)',    value: r => r.engine || '' },
        { title: 'Blade (grader)', value: r => r.blade || '' },
        { title: 'Bucket (m3)',    value: r => r.bucket || '' },
