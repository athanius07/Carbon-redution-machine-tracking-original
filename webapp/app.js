
async function load() {
  const res = await fetch('../data/machines.json', { cache: 'no-store' });
  if (!res.ok) { throw new Error('Cannot load data'); }

  // 1) Parse JSON
  let data = await res.json();

  // 2) Unwrap if your JSON is { rows: [...] } (else keep as-is)
  let rows = Array.isArray(data) ? data : (data?.rows || []);

  // 3) Normalize keys so downstream code can keep using old names
  rows = rows.map(r => ({
    ...r,

    // Class (tonnes)
    class:  r.class ?? r.class_tons ?? r.class_t ?? "",

    // Engine/Motor power (kW)
    engine: r.engine ?? r.engine_power_kw ?? r.motor_kw ?? "",

    // Bucket size (m³)
    bucket: r.bucket ?? r.bucket_size_m3 ?? r.bucket_m3 ?? "",

    // Grader blade
    blade:  r.blade ?? r.blade_size ?? "",

    // Year
    year:   r.year ?? r.year_of_release ?? r.release_year ?? "",

    // Status (development/production/etc.)
    status: r.status ?? r.development_status ?? "",
  }));

  return rows;
}

function powerClass(p){
  const k=(p||'').toLowerCase();
  if(k.includes('battery')) return 'power-battery';
  if(k.includes('hydrogen')) return 'power-hydrogen';
  if(k.includes('hybrid')) return 'power-hybrid';
  if(k.includes('methanol')||k.includes('ethanol')||k.includes('other')) return 'power-methanol';
  return '';
}

function render(rows){
  const checks=[...document.querySelectorAll('.type-toggle')];
  const allowed=new Set(checks.filter(c=>c.checked).map(c=>c.value));
  const tbody=document.querySelector('#equip tbody');
  tbody.innerHTML='';
  rows.filter(r=>allowed.has(r.type||r.type_hint||''))
      .forEach(r=>{
        const tr=document.createElement('tr');
        const link=r.link?`<a href="${r.link}" target="_blank" rel="noopener">Source</a>`:'';
        tr.innerHTML=`
          <td><span class="power-pill ${powerClass(r.power)}">${r.power||''}</span></td>
          <td>${r.oem||''}</td>
          <td>${r.country||''}</td>
          <td>${r.class_tons||''}</td>
          <td>${r.engine_power_kw||''}</td>
          <td>${r.blade_size||''}</td>
          <td>${r.bucket_size_m3||''}</td>
          <td>${r.type||''}</td>
          <td>${r.year_of_release||''}</td>
          <td>${r.development_status||''}</td>
          <td>${r.model_number||''}</td>
          <td class="link">${link}</td>
          <td>${(r.link_date||'')}</td>`;
        tbody.appendChild(tr);
      });
