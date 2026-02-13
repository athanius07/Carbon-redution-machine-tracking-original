async function load() {
  try {
    // Build a URL relative to the page (NOT relative to app.js),
    // safe for GH Pages project sites that live under /<repo>/
    const res = await fetch('../data/machines.json', { cache: 'no-store' });

    const res = await fetch(dataUrl, { cache: 'no-store' });
    if (!res.ok) { throw new Error(`Cannot load data: ${res.status} ${res.statusText}`); }

    const raw = await res.json();
    let rows = Array.isArray(raw) ? raw : (raw?.rows || []);
    if (!Array.isArray(rows)) {
      console.warn('Unexpected JSON shape; got:', raw);
      rows = [];
    }

    // … keep your normalization here …

    // Normalize to classic keys used by the table
    rows = rows.map(r => ({
      ...r,
      class:  r.class  ?? r.class_tons       ?? r.class_t       ?? "",
      engine: r.engine ?? r.engine_power_kw  ?? r.motor_kw      ?? "",
      bucket: r.bucket ?? r.bucket_size_m3   ?? r.bucket_m3     ?? "",
      blade:  r.blade  ?? r.blade_size       ?? "",
      year:   r.year   ?? r.year_of_release  ?? r.release_year  ?? "",
      status: r.status ?? r.development_status ?? "",
    }));

    console.log(`Loaded ${rows.length} machines`);
    return rows;
  } catch (err) {
    console.error('load() failed:', err);
    const el = document.getElementById('error') || document.body;
    el.insertAdjacentHTML(
      'afterbegin',
      `<div style="color:#b00020">Data load failed: ${err.message}</div>`
    );
    return [];
  }
}

// --- Helpers -----------------------------------------------------------------
function powerClass(p) {
  const k = (p || '').toLowerCase();
  if (k.includes('battery'))  return 'power-battery';
  if (k.includes('hydrogen')) return 'power-hydrogen';
  if (k.includes('hybrid'))   return 'power-hybrid';
  if (k.includes('methanol') || k.includes('ethanol') || k.includes('other'))
    return 'power-methanol';
  return '';
}

// --- Render ------------------------------------------------------------------
function render(rows) {
  const checks  = [...document.querySelectorAll('.type-toggle')];
  const allowed = new Set(checks.filter(c => c.checked).map(c => c.value));
  const tbody   = document.querySelector('#equip tbody');

  if (!tbody) {
    console.error('Missing table body: #equip tbody');
    return;
  }

  tbody.innerHTML = '';

  rows
    .filter(r => allowed.has((r.type_html || r.type || '').trim()))
    .forEach(r => {
      const tr = document.createElement('tr');
      const linkHtml = r.link
        ? `<a href="${r.link}" target="_: '';

      tr.innerHTML = `
        <td><span class="power-pill ${powerClass(r.power)}">${r.power || ''}</span></td>
        <td>${r.oem || ''}</td>
        <td>${r.country || ''}</td>

        <!-- normalized or raw -->
        <td>${r.class ?? r.class_tons ?? r.class_t ?? ''}</td>
        <td>${r.engine ?? r.engine_power_kw ?? r.motor_kw ?? ''}</td>
        <td>${r.blade ?? r.blade_size ?? ''}</td>
        <td>${r.bucket ?? r.bucket_size_m3 ?? r.bucket_m3 ?? ''}</td>

        <td>${r.type || ''}</td>
        <td>${r.year ?? r.year_of_release ?? r.release_year ?? ''}</td>
        <td>${r.status ?? r.development_status ?? ''}</td>
        <td class="link">${linkHtml}</td>
        <td>${r.link_date || ''}</td>
      `;
      tbody.appendChild(tr);
    });
}

// --- Bootstrap ---------------------------------------------------------------
(async () => {
  const rows = await load();
  console.log('Rows after load:', rows.length);
  render(rows);
})();
