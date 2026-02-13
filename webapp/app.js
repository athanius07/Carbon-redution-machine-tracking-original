// webapp/apps.js

function showError(msg) {
  const el = document.createElement("div");
  el.style.background = "#ffe8e6";
  el.style.border = "1px solid #db2828";
  el.style.color = "#912d2b";
  el.style.padding = "8px 12px";
  el.style.margin = "8px 0";
  el.style.borderRadius = "4px";
  el.textContent = `Error: ${msg}`;
  document.body.insertBefore(el, document.body.firstChild);
}

async function loadData() {
  try {
    // When serving /webapp/index.html, ../data points to /data at repo root
    const resp = await fetch("../data/machines.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} loading machines.json`);
    const data = await resp.json();
    if (!Array.isArray(data)) throw new Error("machines.json is not an array");
    return data;
  } catch (e) {
    console.error(e);
    showError(e.message);
    return [];
  }
}

// Value helper with fallbacks (supports old & new field names)
function pick(row, candidates, defaultVal = "") {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return defaultVal;
}

function fmt(val, unit) {
  if (val === null || val === undefined || val === "") return "";
  return `${val}${unit ? " " + unit : ""}`;
}

function bladeDisplay(row) {
  // Prefer pre-composed 'blade'
  const blade = pick(row, ["blade"]);
  if (blade) return blade;

  const w = pick(row, ["blade_w_m"]);
  const h = pick(row, ["blade_h_m"]);
  if (w && h) return `${w} m × ${h} m`;
  if (w) return `${w} m`;
  // Some datasets might store blade as plain text under different key
  const bladeSize = pick(row, ["blade_size"]);
  return bladeSize || "";
}

function rowHtml(row) {
  // Normalize field names between old & new
  const power   = pick(row, ["power"]);
  const oem     = pick(row, ["oem"]);
  const country = pick(row, ["country"]);

  // class (t)
  const klass   = pick(row, ["class", "class_tons"]);

  // engine power (kW)
  const engineKw = pick(row, ["engine_kw", "engine_power_kw"]);

  // bucket (m³)
  const bucketM3 = pick(row, ["bucket_m3", "bucket_size_m3"]);

  // type
  const type = pick(row, ["type"]);

  // year / status / model
  const year   = pick(row, ["year", "year_of_release"]);
  const status = pick(row, ["status", "development_status"]);
  const model  = pick(row, ["model", "model_number"]);

  // link / date
  const link = pick(row, ["link"]);
  const date = pick(row, ["date"]);

  return `
    <tr>
      <td><span class="badge">${power || ""}</span></td>
      <td>${oem || ""}</td>
      <td>${country || ""}</td>
      <td>${klass || ""}</td>
      <td>${fmt(engineKw, "kW")}</td>
      <td>${bladeDisplay(row)}</td>
      <td>${fmt(bucketM3, "m³")}</td>
      <td>${type || ""}</td>
      <td>${year || ""}</td>
      <td>${status || ""}</td>
      <td>${model || ""}</td>
      <td>${link ? `${link}Source</a>` : ""}</td>
      <td>${date || ""}</td>
    </tr>`;
}

function renderTable(rows) {
  const tbody = document.querySelector("#machines tbody");
  if (!tbody) {
    showError("Table element #machines not found in index.html");
    return;
  }
  tbody.innerHTML = rows.map(rowHtml).join("");
}

function exportCSV(rows) {
  const headers = ["Power","OEM","Country","Class","Engine/Motor (kW)","Blade (grader)","Bucket (m³)","Type","Year","Status","Model","Link","Date","Tonnage (t)"];
  const lines = [headers.join(",")];
  rows.forEach(r => {
    const line = [
      pick(r, ["power"]),
      pick(r, ["oem"]),
      pick(r, ["country"]),
      pick(r, ["class", "class_tons"]),
      pick(r, ["engine_kw", "engine_power_kw"]),
      bladeDisplay(r),
      pick(r, ["bucket_m3", "bucket_size_m3"]),
      pick(r, ["type"]),
      pick(r, ["year", "year_of_release"]),
      pick(r, ["status", "development_status"]),
      pick(r, ["model", "model_number"]),
      pick(r, ["link"]),
      pick(r, ["date"]),
      pick(r, ["tonnage_t", "class_tons"]) // crude fallback if tonnage_t missing
    ].map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",");
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
