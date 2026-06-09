const statusColors = {
  returned: "#0094d3",
  missing: "#ffd603",
  request_only: "#9aa4b2",
  ownership_risk: "#c2410c"
};

const state = {
  geojson: null,
  monthlyMetrics: [],
  contractorRows: [],
  summary: null,
  map: null,
  layer: null
};

const formatNumber = new Intl.NumberFormat("en-US");

function cleanStatus(status) {
  return status || "missing";
}

function statusLabel(status) {
  return {
    returned: "Returned",
    missing: "Assigned, not returned",
    request_only: "Request Only",
    ownership_risk: "Ownership risk"
  }[status] || status;
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  const headers = rows.shift().split(",");
  return rows.map((row) => {
    const values = row.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function selectedFeatures() {
  const filters = currentFilters();
  return state.geojson.features.filter((feature) => featureMatches(feature, filters));
}

function monthFeatures(month) {
  return state.geojson.features.filter((feature) => feature.properties.period_month === month);
}

function uniqueCount(features, predicate = () => true) {
  return new Set(
    features
      .filter(predicate)
      .map((feature) => feature.properties.parcel_key)
      .filter(Boolean)
  ).size;
}

async function loadData() {
  const [geojson, monthlyMetrics, contractorText, summary] = await Promise.all([
    fetch("data/parcels_monthly.geojson").then((response) => response.json()),
    fetch("data/monthly_metrics.json").then((response) => response.json()),
    fetch("data/contractor_monthly.csv").then((response) => response.text()),
    fetch("data/kpi_summary.json").then((response) => response.json())
  ]);

  state.geojson = geojson;
  state.monthlyMetrics = monthlyMetrics;
  state.contractorRows = parseCsv(contractorText);
  state.summary = summary;
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    zoomSnap: 0.25
  }).setView([40.443, -79.995], 12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  }).addTo(state.map);
}

function populateFilters() {
  const monthSelect = document.getElementById("month-select");
  const contractorSelect = document.getElementById("contractor-select");
  const ownerSelect = document.getElementById("owner-select");

  const months = [...new Set(state.monthlyMetrics.map((row) => row.period_month))].sort();
  monthSelect.innerHTML = months
    .map((month) => `<option value="${month}">${month}</option>`)
    .join("");
  monthSelect.value = state.summary.latest_month;

  const contractors = [...new Set(state.contractorRows.map((row) => row.organization))].sort();
  contractorSelect.innerHTML = [
    '<option value="all">All contractors</option>',
    ...contractors.map((name) => `<option value="${name}">${name}</option>`)
  ].join("");

  const owners = [
    ...new Set(
      state.geojson.features
        .map((feature) => feature.properties.ownership_type || "Other or unknown")
        .filter(Boolean)
    )
  ].sort();
  ownerSelect.innerHTML = [
    '<option value="all">All ownership</option>',
    ...owners.map((name) => `<option value="${name}">${name}</option>`)
  ].join("");
  ownerSelect.value = "all";
}

function currentFilters() {
  return {
    month: document.getElementById("month-select").value,
    contractor: document.getElementById("contractor-select").value,
    status: document.getElementById("status-select").value,
    owner: document.getElementById("owner-select").value
  };
}

function featureMatches(feature, filters) {
  const props = feature.properties;
  if (props.period_month !== filters.month) return false;
  if (filters.contractor !== "all" && props.organization !== filters.contractor) return false;
  if (filters.status !== "all" && props.completion_status !== filters.status) return false;
  if (filters.owner !== "all" && (props.ownership_type || "Other or unknown") !== filters.owner) return false;
  return true;
}

function layerStyle(feature) {
  const status = cleanStatus(feature.properties.completion_status);
  return {
    color: status === "returned" ? "#003b6f" : "#1f2937",
    fillColor: statusColors[status] || statusColors.missing,
    fillOpacity: status === "request_only" ? 0.68 : 0.92,
    opacity: 1,
    weight: status === "returned" ? 1.8 : 1.45
  };
}

function popupHtml(props) {
  return `
    <strong>${props.parcel_key}</strong><br>
    ${props.organization}<br>
    ${props.period_month}<br>
    ${props.maintenance_level} | ${statusLabel(props.completion_status)}<br>
    ${props.ownership_type || "Other or unknown"}
  `;
}

function detailHtml(props) {
  const geometryLabel = props.masked_geometry ? "masked sample" : "PostgreSQL export";
  return `
    <strong>${props.parcel_key}</strong><br>
    Contractor: ${props.organization}<br>
    Month: ${props.period_month}<br>
    Level: ${props.maintenance_level}<br>
    Ownership: ${props.ownership_type || "Other or unknown"}<br>
    Owner: ${props.owner_name || "Unknown"}<br>
    Status: ${statusLabel(props.completion_status)}<br>
    Geometry: ${geometryLabel}
  `;
}

function renderMap() {
  const filtered = {
    type: "FeatureCollection",
    features: selectedFeatures()
  };

  if (state.layer) {
    state.map.removeLayer(state.layer);
  }

  state.layer = L.geoJSON(filtered, {
    style: layerStyle,
    onEachFeature: (feature, layer) => {
      layer.bindPopup(popupHtml(feature.properties));
      layer.on("click", () => {
        document.getElementById("parcel-detail").innerHTML = detailHtml(feature.properties);
      });
      layer.on("mouseover", () => {
        layer.setStyle({
          color: "#000000",
          fillOpacity: 1,
          weight: 3
        });
        layer.bringToFront();
      });
      layer.on("mouseout", () => {
        state.layer.resetStyle(layer);
      });
    }
  }).addTo(state.map);
  state.layer.bringToFront();

  if (filtered.features.length > 0 && state.layer.getBounds().isValid()) {
    const fitLayer = () => {
      state.map.invalidateSize();
      state.map.fitBounds(state.layer.getBounds(), { padding: [24, 24], maxZoom: 16 });
    };
    requestAnimationFrame(fitLayer);
    setTimeout(fitLayer, 250);
  }
}

function renderKpis() {
  const filters = currentFilters();
  const metrics = state.monthlyMetrics.find((row) => row.period_month === filters.month);
  if (!metrics) return;

  const features = selectedFeatures();
  const assigned = uniqueCount(features);
  const returned = uniqueCount(features, (feature) => feature.properties.returned_flag);
  const active = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Active");
  const open = uniqueCount(features, (feature) => feature.properties.completion_status === "missing");
  const ura = uniqueCount(features, (feature) => feature.properties.ownership_type === "URA");
  const plb = uniqueCount(features, (feature) => feature.properties.ownership_type === "Pittsburgh Land Bank");
  const rate = active ? (100 * returned) / active : 0;

  document.getElementById("kpi-assigned").textContent = formatNumber.format(assigned);
  document.getElementById("kpi-returned").textContent = formatNumber.format(returned);
  document.getElementById("kpi-active-rate").textContent = `${rate.toFixed(1)}%`;
  document.getElementById("kpi-open").textContent = formatNumber.format(open);
  document.getElementById("kpi-open-note").textContent = `${filters.month} map filter`;
  document.getElementById("kpi-ownership").textContent = `${formatNumber.format(ura)} / ${formatNumber.format(plb)}`;

  const comparison = state.summary.powerbi_comparison;
  document.getElementById("kpi-powerbi").textContent = formatNumber.format(comparison.dashboard_returned_count);
  document.getElementById("kpi-powerbi-note").textContent =
    `${formatNumber.format(comparison.dashboard_assigned_count)} assigned in current report`;
  document.getElementById("kpi-assigned-note").textContent = `${filters.month} selected parcels`;
  document.getElementById("source-note").textContent = state.summary.source_note;
}

function renderRanking() {
  const filters = currentFilters();
  let rows = state.contractorRows.filter((row) => row.period_month === filters.month);
  if (filters.contractor !== "all") {
    rows = rows.filter((row) => row.organization === filters.contractor);
  }

  rows.sort((a, b) => Number(b.completion_rate_pct) - Number(a.completion_rate_pct));

  document.getElementById("contractor-ranking").innerHTML = rows.map((row) => {
    const rate = Number(row.completion_rate_pct);
    return `
      <div class="rank-row">
        <div class="rank-row-header">
          <strong>${row.organization}</strong>
          <span>${rate.toFixed(1)}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(rate, 100)}%"></div></div>
        <span>${formatNumber.format(Number(row.returned_assigned_parcel_keys))} of ${formatNumber.format(Number(row.assigned_parcel_keys))} returned</span>
      </div>
    `;
  }).join("");
}

function renderActionFocus() {
  const filters = currentFilters();
  const features = monthFeatures(filters.month);
  const byContractor = new Map();

  for (const feature of features) {
    const props = feature.properties;
    if (props.maintenance_level !== "Active") continue;
    const name = props.organization || "Unassigned";
    if (!byContractor.has(name)) {
      byContractor.set(name, { assigned: new Set(), returned: new Set(), open: new Set() });
    }
    const bucket = byContractor.get(name);
    bucket.assigned.add(props.parcel_key);
    if (props.returned_flag) {
      bucket.returned.add(props.parcel_key);
    }
    if (props.completion_status === "missing") {
      bucket.open.add(props.parcel_key);
    }
  }

  const ranked = [...byContractor.entries()]
    .map(([name, values]) => ({
      name,
      assigned: values.assigned.size,
      returned: values.returned.size,
      open: values.open.size,
      rate: values.assigned.size ? (100 * values.returned.size) / values.assigned.size : 0
    }))
    .sort((a, b) => b.open - a.open)
    .slice(0, 3);

  const ownerFeatures = selectedFeatures();
  const city = uniqueCount(ownerFeatures, (feature) => feature.properties.ownership_type === "City of Pittsburgh");
  const other = uniqueCount(ownerFeatures, (feature) => feature.properties.ownership_type === "Other or unknown");

  document.getElementById("action-focus").innerHTML = [
    `<div><strong>${formatNumber.format(city)}</strong><span>City-owned parcels in current map filter</span></div>`,
    `<div><strong>${formatNumber.format(other)}</strong><span>Other or unknown owner labels to verify</span></div>`,
    ...ranked.map(
      (row) =>
        `<div><strong>${formatNumber.format(row.open)}</strong><span>${row.name} open assignments</span></div>`
    )
  ].join("");
}

function renderTrend() {
  const months = state.monthlyMetrics.map((row) => row.period_month);
  const assigned = state.monthlyMetrics.map((row) => row.assigned_total);
  const returned = state.monthlyMetrics.map((row) => row.returned_assigned);
  const activeRate = state.monthlyMetrics.map((row) => row.active_completion_rate_pct);

  const traces = [
    {
      x: months,
      y: assigned,
      name: "Assigned",
      type: "bar",
      marker: { color: "#ffd603" },
      hovertemplate: "%{x}<br>Assigned: %{y:,}<extra></extra>"
    },
    {
      x: months,
      y: returned,
      name: "Returned",
      type: "scatter",
      mode: "lines+markers",
      line: { color: "#0094d3", width: 3 },
      marker: { size: 8 },
      hovertemplate: "%{x}<br>Returned: %{y:,}<extra></extra>"
    },
    {
      x: months,
      y: activeRate,
      name: "Active completion %",
      type: "scatter",
      yaxis: "y2",
      mode: "lines",
      line: { color: "#111827", width: 2, dash: "dot" },
      hovertemplate: "%{x}<br>Active rate: %{y:.1f}%<extra></extra>"
    }
  ];

  const layout = {
    autosize: true,
    margin: { l: 52, r: 52, t: 10, b: 48 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    font: { family: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: "#182233" },
    legend: { orientation: "h", y: 1.12 },
    xaxis: { tickangle: -35, showgrid: false },
    yaxis: { title: "Parcel keys", gridcolor: "#d9e2ec" },
    yaxis2: {
      title: "Completion %",
      overlaying: "y",
      side: "right",
      range: [0, Math.max(100, Math.max(...activeRate) + 10)],
      gridcolor: "#ffffff"
    }
  };

  Plotly.react("trend-chart", traces, layout, { displayModeBar: false, responsive: true });
}

function renderAll() {
  renderKpis();
  renderMap();
  renderRanking();
  renderActionFocus();
  renderTrend();
}

async function main() {
  await loadData();
  initMap();
  populateFilters();
  ["month-select", "contractor-select", "status-select", "owner-select"].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderAll);
  });
  window.addEventListener("resize", () => {
    state.map.invalidateSize();
  });
  renderAll();
}

main().catch((error) => {
  document.body.innerHTML = `<pre class="load-error">${error.stack || error}</pre>`;
});
