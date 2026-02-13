// webapp/apps.js

async function loadData() {
  const resp = await fetch("../data/machines.json");
  return await resp.json();
}

function fmt(val, unit) {
  if (val === null || val === undefined || val === "") return "";
  return `${val}${unit ? " " + unit : ""}`;
}

function bladeDisplay(row) {
  if (row.blade) return row.blade; // pre-composed string from scraper
  const w = row.blade_w_m, h = row.blade_h_m;
  if (w && h) return `${w} m × ${h} m`;
  if (w) return `${w} m`;
  return "";
}

function rowHtml(row) {
  return `
    <tr>
      <td><span class="badge">${row.power || ""}</span></td>
      <td>${row.oem || ""}</td>
      <td>${row.country || ""}</td>
      <td>${row.class || ""}</td>
      <td>${fmt(row.engine_kw, "kW")}</td>
      <td>${bladeDisplay(row)}</td>
      <td>${fmt(row.bucket_m3, "m³")}</td>
      <td>${row.type || ""}</td>
      <td>${row.year || ""}</td>
      <td>${row.status || ""}</td>
      <td>${row.model || ""}</td>
      <td><a href="${row.link}" target="_blank"${row.date || ""}</td>
    </tr>`;
}

function renderTable(rows) {
  const tbody = document.querySelector("#machines tbody");
  tbody.innerHTML = rows.map(rowHtml).join("");
}

function exportCSV(rows) {
  const headers = ["Power","OEM","Country","Class","Engine/Motor (kW)","Blade (grader)","Bucket (m³)","Type","Year","Status","Model","Link","Date","Tonnage (t)"];
  const lines = [headers.join(",")];
  rows.forEach(r => {
    const line = [
      r.power || "",
      r.oem || "",
      r.country || "",
      r.class || "",
      r.engine_kw ?? "",
      bladeDisplay(r),
      r.bucket_m3 ?? "",
      r.type || "",
      r.year || "",
      r.status || "",
      r.model || "",
      r.link || "",
      r.date || "",
      r.tonnage_t ?? ""
    ].map(x => `"${String(x).replace(/"/g, '""')}"`).join(",");
    lines.push(line);
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "machines.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

(async function () {
  const data = await loadData();
  renderTable(data);

  const btn = document.getElementById("downloadCsv");
  if (btn) btn.addEventListener("click", () => exportCSV(data));
})();
``
