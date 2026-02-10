
async function load() {
  try {
    const res = await fetch('machines.json', { cache: 'no-store' });
    if (!res.ok) { throw new Error(`Cannot load data: ${res.status} ${res.statusText}`); }

    const raw = await res.json();
    let rows = Array.isArray(raw) ? raw : (raw?.rows || []);
    if (!Array.isArray(rows)) {
      console.warn('Unexpected JSON shape; got:', raw);
      rows = [];
    }

    // Normalize field names (accept both old and new variants)
    rows = rows.map(r => ({
      ...r,
      class:  r.class  ?? r.class_tons   ?? r.class_t   ?? "",
      engine: r.engine ?? r.engine_power_kw ?? r.motor_kw ?? "",
      bucket: r.bucket ?? r.bucket_size_m3  ?? r.bucket_m3 ?? "",
      blade:  r.blade  ?? r.blade_size      ?? "",
      year:   r.year   ?? r.year_of_release ?? r.release_year ?? "",
      status: r.status ?? r.development_status ?? "",
    }));

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

function powerClass(p){
  const k=(p||'').toLowerCase();
  if(k.includes('battery')) return 'power-battery';
  if(k.includes('hydrogen')) return 'power-hydrogen';
  if(k.includes('hybrid')) return 'power-hybrid';
  if(k.includes('methanol')||k.includes('ethanol')||k.includes('other')) return 'power-methanol';
  return '';
}

function render(rows) {
  const checks   = [...document.querySelectorAll('.type-toggle')];
  const allowed  = new Set(checks.filter(c => c.checked).map(c => c.value));
  const tbody    = document.querySelector('#equip tbody');

  tbody.innerHTML = '';

  rows
    .filter(r => allowed.has((r.type_html || r.type || '').trim()))
    .forEach(r => {
      const tr = document.createElement('tr');
      const linkHtml = r.link
        ? `<{r.link}Source</a>`
        : '';

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
} // <-- make sure this closing brace exists
``;

(async () => {
  const rows = await load();
  render(rows);
})();
console.log('APP LOADED OK');
