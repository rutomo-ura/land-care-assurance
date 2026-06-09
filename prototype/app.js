const statusColors = {
  returned: "#1155cc",
  missing: "#c69214",
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
  state.map = L.map("map", { zoomControl: true }).setView([40.443, -79.995], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
}

function populateFilters() {
  const monthSelect = document.getElementById("month-select");
  const contractorSelect = document.getElementById("contractor-select");

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
}

function currentFilters() {
  return {
    month: document.getElementById("month-select").value,
    contractor: document.getElementById("contractor-select").value,
    status: document.getElementById("status-select").value
  };
}

function featureMatches(feature, filters) {
  const props = feature.properties;
  if (props.period_month !== filters.month) return false;
  if (filters.contractor !== "all" && props.organization !== filters.contractor) return false;
  if (filters.status !== "all" && props.completion_status !== filters.status) return false;
  return true;
}

function layerStyle(feature) {
  const status = cleanStatus(feature.properties.completion_status);
  return {
    color: "#ffffff",
    fillColor: statusColors[status] || statusColors.missing,
    fillOpacity: status === "request_only" ? 0.58 : 0.76,
    opacity: 1,
    weight: 1
  };
}

function popupHtml(props) {
  return `
    <strong>${props.parcel_key}</strong><br>
    ${props.organization}<br>
    ${props.period_month}<br>
    ${props.maintenance_level} | ${statusLabel(props.completion_status)}
  `;
}

function detailHtml(props) {
  const geometryLabel = props.masked_geometry ? "masked sample" : "PostgreSQL export";
  return `
    <strong>${props.parcel_key}</strong><br>
    Contractor: ${props.organization}<br>
    Month: ${props.period_month}<br>
    Level: ${props.maintenance_level}<br>
    Status: ${statusLabel(props.completion_status)}<br>
    Geometry: ${geometryLabel}
  `;
}

function renderMap() {
  const filters = currentFilters();
  const filtered = {
    type: "FeatureCollection",
    features: state.geojson.features.filter((feature) => featureMatches(feature, filters))
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
    }
  }).addTo(state.map);

  if (filtered.features.length > 0) {
    state.map.fitBounds(state.layer.getBounds(), { padding: [18, 18] });
  }
}

function renderKpis() {
  const filters = currentFilters();
  const metrics = state.monthlyMetrics.find((row) => row.period_month === filters.month);
  if (!metrics) return;

  document.getElementById("kpi-assigned").textContent = formatNumber.format(metrics.assigned_total);
  document.getElementById("kpi-returned").textContent = formatNumber.format(metrics.returned_assigned);
  document.getElementById("kpi-active-rate").textContent = `${metrics.active_completion_rate_pct.toFixed(1)}%`;
  document.getElementById("kpi-current-month").textContent = formatNumber.format(metrics.returned_assigned);
  document.getElementById("kpi-current-note").textContent = `${filters.month} returned assignment keys`;

  const comparison = state.summary.powerbi_comparison;
  document.getElementById("kpi-powerbi").textContent = `${comparison.dashboard_returned_count}`;
  document.getElementById("kpi-powerbi-note").textContent = `Power BI returned, diff ${comparison.returned_difference}`;
  document.getElementById("kpi-assigned-note").textContent = `Power BI assigned diff ${comparison.assigned_difference}`;
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
      marker: { color: "#c69214" },
      hovertemplate: "%{x}<br>Assigned: %{y:,}<extra></extra>"
    },
    {
      x: months,
      y: returned,
      name: "Returned",
      type: "scatter",
      mode: "lines+markers",
      line: { color: "#1155cc", width: 3 },
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
      line: { color: "#0b377a", width: 2, dash: "dot" },
      hovertemplate: "%{x}<br>Active rate: %{y:.1f}%<extra></extra>"
    }
  ];

  const layout = {
    autosize: true,
    margin: { l: 52, r: 52, t: 10, b: 48 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    font: { family: 'Inter, "Segoe UI", Arial, sans-serif', color: "#182233" },
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
  renderTrend();
}

async function main() {
  await loadData();
  initMap();
  populateFilters();
  ["month-select", "contractor-select", "status-select"].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderAll);
  });
  renderAll();
}

main().catch((error) => {
  document.body.innerHTML = `<pre class="load-error">${error.stack || error}</pre>`;
});
