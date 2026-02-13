
async function load(){
  const res = await fetch('../data/machines.json', {cache:'no-store'});
  if(!res.ok){ throw new Error('Cannot load data'); }
  return await res.json();
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
}

(async function(){
  try{
    const data = await load();
    const original=data.slice();
    document.querySelectorAll('.type-toggle').forEach(ch=> ch.addEventListener('change',()=>render(original)));
    document.getElementById('downloadCsv').addEventListener('click',()=>{
      const a=document.createElement('a');
      a.href='../data/machines.csv';
      a.download='machines.csv';
      a.click();
    });
    render(original);
  }catch(e){
    console.error(e);
    alert('Could not load data. If viewing locally, serve via a small web server or open this site on GitHub Pages.');
  }
})();
