const DATA_ROOT = "../landcare/data";
const EPP_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_epp_parcels_full/FeatureServer/0";
const SURVEY_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_surveys/FeatureServer/0";
const CURRENT_WHERE = "tags LIKE '%LandCare%' AND inventory_type = 'URA Owned'";
const CURRENT_OUT_FIELDS = [
  "OBJECTID",
  "parcel_number",
  "property_id",
  "inventory_type",
  "property_maint_mgr_name",
  "tags",
  "mod_dt"
].join(",");

const formatter = new Intl.NumberFormat("en-US");
const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatNumber(value) {
  return formatter.format(Number(value || 0));
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function shortMonth(month) {
  const [year, rawMonth] = String(month).split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function shortContractor(name) {
  return String(name || "Unassigned")
    .replace("FHCV Contracting LLC & LawnCare", "FHCV Contracting")
    .replace("Ervin Home Beautification", "Ervin Home")
    .replace("Operation Better Block", "Op. Better Block")
    .replace("One Call Handles It All", "One Call");
}

function dateFromMillis(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function currentMaintenanceLevel(tags) {
  const text = String(tags || "");
  if (text.includes("LandCare - Request Only")) return "Request Only";
  if (text.includes("LandCare - Active")) return "Active";
  return "LandCare";
}

function stripPrimaryContact(value) {
  return String(value || "Unassigned").replace(/\s+Primary Contact$/i, "") || "Unassigned";
}

function normalizeCurrentRecord(attrs) {
  const parcelKey = attrs.parcel_number || attrs.property_id || `EPP-${attrs.OBJECTID}`;
  return {
    parcelKey,
    contractor: stripPrimaryContact(attrs.property_maint_mgr_name),
    contact: attrs.property_maint_mgr_name || "Unassigned",
    level: currentMaintenanceLevel(attrs.tags),
    modDate: dateFromMillis(attrs.mod_dt)
  };
}

async function fetchArcgisJson(url, params) {
  const response = await fetch(`${url}?${new URLSearchParams(params).toString()}`);
  if (!response.ok) throw new Error(`ArcGIS request failed: ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "ArcGIS request failed");
  return payload;
}

async function loadCurrentArcgisMetrics() {
  const [layerInfo, surveyInfo, result] = await Promise.all([
    fetchArcgisJson(EPP_LAYER_URL, { f: "json" }),
    fetchArcgisJson(SURVEY_LAYER_URL, { f: "json" }),
    fetchArcgisJson(`${EPP_LAYER_URL}/query`, {
      f: "json",
      where: CURRENT_WHERE,
      outFields: CURRENT_OUT_FIELDS,
      returnGeometry: "false",
      resultRecordCount: "2000",
      orderByFields: "property_maint_mgr_name ASC, parcel_number ASC"
    })
  ]);
  const records = (result.features || []).map((feature) => normalizeCurrentRecord(feature.attributes || {}));
  const parcelKeys = new Set(records.map((record) => record.parcelKey).filter(Boolean));
  const activeKeys = new Set(records.filter((record) => record.level === "Active").map((record) => record.parcelKey));
  const requestOnlyKeys = new Set(records.filter((record) => record.level === "Request Only").map((record) => record.parcelKey));
  const contractorKeys = new Set(records.map((record) => record.contractor).filter(Boolean));
  return {
    source: "live_arcgis",
    records: records.length,
    uniqueParcels: parcelKeys.size,
    activeParcels: activeKeys.size,
    requestOnlyParcels: requestOnlyKeys.size,
    duplicateKeys: records.length - parcelKeys.size,
    contractors: contractorKeys.size,
    eppEdited: dateFromMillis(layerInfo.editingInfo?.dataLastEditDate),
    surveyEdited: dateFromMillis(surveyInfo.editingInfo?.dataLastEditDate),
    sourceLayer: "gisdb_gis_epp_parcels_full",
    surveyLayer: "gisdb_gis_regrid_surveys"
  };
}

function rateColor(rate) {
  if (rate >= 80) return "#2e7d32";
  if (rate >= 50) return "#0098d3";
  if (rate >= 10) return "#e65100";
  return "#b71c1c";
}

function latestMetric(monthlyMetrics, latestMonth) {
  return monthlyMetrics.find((row) => row.period_month === latestMonth) || monthlyMetrics.at(-1);
}

function priorMetric(monthlyMetrics, latestMonth) {
  const index = monthlyMetrics.findIndex((row) => row.period_month === latestMonth);
  return index > 0 ? monthlyMetrics[index - 1] : null;
}

function renderKpis(summary, monthlyMetrics, latestSummary, currentMetrics) {
  const latest = latestMetric(monthlyMetrics, summary.latest_month);
  const prior = priorMetric(monthlyMetrics, summary.latest_month);
  const activeAssigned = currentMetrics.activeParcels;
  const returned = summary.status_counts?.returned || latest?.returned_assigned || 0;
  const open = summary.status_counts?.missing || 0;
  const monthlyActive = summary.level_counts?.Active || latest?.assigned_active || 0;
  const completion = monthlyActive ? (100 * returned) / monthlyActive : 0;
  const priorRate = Number(prior?.active_completion_rate_pct || 0);
  const delta = completion - priorRate;
  const comparison = latestSummary.powerbi_comparison || {};

  document.getElementById("freshnessNote").textContent =
    `Current universe from live ArcGIS EPP layer edited ${currentMetrics.eppEdited || "unknown"}. Monthly completion history generated ${latestSummary.generated_on}.`;
  document.getElementById("activeAssignedKpi").textContent = formatNumber(activeAssigned);
  document.getElementById("activeAssignedNote").textContent =
    `${formatNumber(currentMetrics.uniqueParcels)} current URA-owned parcels`;
  document.getElementById("returnedKpi").textContent = formatNumber(currentMetrics.requestOnlyParcels);
  document.getElementById("completionKpi").textContent = formatPct(completion);
  document.getElementById("completionDelta").textContent =
    prior ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts vs ${prior.period_month}` : "No prior month";
  document.getElementById("openKpi").textContent = formatNumber(open);
  document.getElementById("mappedKpi").textContent = formatNumber(currentMetrics.records);
  document.getElementById("spendKpi").textContent = moneyFormatter.format(comparison.total_amount_spent || 0);
  document.getElementById("spendNote").textContent =
    `${Math.round((100 * (comparison.total_amount_spent || 0)) / (comparison.projected_yearly_limit || 1))}% of ${moneyFormatter.format(comparison.projected_yearly_limit || 0)} limit`;
}

function renderContractorOptions(rows, latestMonth) {
  const select = document.getElementById("contractorSelect");
  const names = [...new Set(rows.filter((row) => row.period_month === latestMonth).map((row) => row.organization))].sort();
  select.innerHTML = [
    '<option value="all">All contractors</option>',
    ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(shortContractor(name))}</option>`)
  ].join("");
}

function renderContractorBars(rows, latestMonth, selected = "all") {
  const latestRows = rows
    .filter((row) => row.period_month === latestMonth)
    .filter((row) => selected === "all" || row.organization === selected)
    .sort((a, b) => b.completion_rate_pct - a.completion_rate_pct);

  document.getElementById("contractorBars").innerHTML = latestRows.map((row) => {
    const color = rateColor(row.completion_rate_pct);
    const width = Math.max(row.completion_rate_pct, row.returned_assigned_parcel_keys ? 2 : 0);
    return `
      <div class="bar-row">
        <div class="bar-meta">
          <strong>${escapeHtml(shortContractor(row.organization))}</strong>
          <span style="color:${color}">${formatPct(row.completion_rate_pct)}</span>
        </div>
        <div class="track"><span class="fill" style="width:${Math.min(width, 100)}%;background:${color}"></span></div>
        <div class="bar-note">${formatNumber(row.returned_assigned_parcel_keys)} of ${formatNumber(row.assigned_parcel_keys)} returned</div>
      </div>
    `;
  }).join("");
}

function renderTimeline(monthlyMetrics) {
  renderLineChart(monthlyMetrics);
  document.getElementById("timelineBars").innerHTML = monthlyMetrics.slice(-4).map((row) => {
    const rate = Number(row.active_completion_rate_pct || 0);
    const color = rateColor(rate);
    return `
      <div class="bar-row">
        <strong>${shortMonth(row.period_month)}</strong>
        <div class="track"><span class="fill" style="width:${Math.max(rate, 1)}%;background:${color}"></span></div>
        <span style="color:${color};font-weight:800">${formatPct(rate)}</span>
      </div>
    `;
  }).join("");
}

function renderLineChart(monthlyMetrics) {
  const container = document.getElementById("completionLineChart");
  const width = 720;
  const height = 300;
  const margin = { top: 24, right: 34, bottom: 48, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = monthlyMetrics.map((row) => Number(row.active_completion_rate_pct || 0));
  const maxValue = Math.max(20, Math.ceil(Math.max(...values) / 10) * 10);
  const toX = (index) =>
    margin.left + (monthlyMetrics.length === 1 ? plotWidth / 2 : (index / (monthlyMetrics.length - 1)) * plotWidth);
  const toY = (value) => margin.top + plotHeight - (value / maxValue) * plotHeight;
  const points = monthlyMetrics.map((row, index) => [toX(index), toY(Number(row.active_completion_rate_pct || 0))]);
  const linePath = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1)[0].toFixed(1)},${(margin.top + plotHeight).toFixed(1)} L${points[0][0].toFixed(1)},${(margin.top + plotHeight).toFixed(1)} Z`;
  const yTicks = [0, Math.round(maxValue / 2), maxValue];
  const xTickIndexes = [...new Set([0, Math.floor((monthlyMetrics.length - 1) / 2), monthlyMetrics.length - 1])];

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="URA-owned active completion rate over time">
      ${yTicks.map((tick) => {
        const y = toY(tick);
        return `
          <line class="chart-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line>
          <text class="chart-tick" x="${margin.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${tick}%</text>
        `;
      }).join("")}
      <line class="chart-axis" x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}"></line>
      <line class="chart-axis" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}"></line>
      <path class="chart-area" d="${areaPath}"></path>
      <path class="chart-line" d="${linePath}"></path>
      ${points.map(([x, y], index) => `
        <circle class="chart-marker" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"></circle>
        ${index === points.length - 1 ? `<text class="chart-value-label" x="${(x - 8).toFixed(1)}" y="${(y - 12).toFixed(1)}" text-anchor="end">${formatPct(values[index])}</text>` : ""}
      `).join("")}
      ${xTickIndexes.map((index) => `
        <text class="chart-label" x="${toX(index).toFixed(1)}" y="${height - 16}" text-anchor="middle">${shortMonth(monthlyMetrics[index].period_month)}</text>
      `).join("")}
    </svg>
  `;
}

function renderReconciliation(latestSummary) {
  const comparison = latestSummary.powerbi_comparison || {};
  const cards = [
    ["Power BI assigned", comparison.dashboard_assigned_count],
    ["URA-owned mapped assigned", comparison.sql_export_assigned_count],
    ["Power BI returned", comparison.dashboard_returned_count],
    ["URA-owned returned", comparison.sql_export_returned_count],
    ["Scope difference", comparison.assigned_difference],
    ["Returned difference", comparison.returned_difference]
  ];
  document.getElementById("reconcileGrid").innerHTML = cards.map(([label, value]) => `
    <div class="reconcile-card">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
    </div>
  `).join("");
}

function renderSource(summary, latestSummary, currentMetrics) {
  document.getElementById("sourceText").textContent =
    `Current parcel universe is queried live from ArcGIS layer ${currentMetrics.sourceLayer}, filtered to URA Owned LandCare records. Live counts: ${formatNumber(currentMetrics.records)} records, ${formatNumber(currentMetrics.uniqueParcels)} unique parcels, ${formatNumber(currentMetrics.activeParcels)} Active, ${formatNumber(currentMetrics.requestOnlyParcels)} Request Only, ${formatNumber(currentMetrics.contractors)} contractors. Monthly survey completion history remains the assurance export for ${summary.latest_month}; assignment freshness is ${latestSummary.latest_assignment_period}; survey completion freshness is ${latestSummary.latest_survey_period}.`;
}

async function loadData() {
  const [summary, monthlyMetrics, contractorRows, latestSummary, currentMetrics] = await Promise.all([
    fetch(`${DATA_ROOT}/latest_month_summary.json`).then((response) => response.json()),
    fetch(`${DATA_ROOT}/monthly_metrics.json`).then((response) => response.json()),
    fetch(`${DATA_ROOT}/contractor_monthly.json`).then((response) => response.json()),
    fetch(`${DATA_ROOT}/kpi_summary.json`).then((response) => response.json()),
    loadCurrentArcgisMetrics()
  ]);
  return { summary, monthlyMetrics, contractorRows, latestSummary, currentMetrics };
}

async function main() {
  const { summary, monthlyMetrics, contractorRows, latestSummary, currentMetrics } = await loadData();
  renderKpis(summary, monthlyMetrics, latestSummary, currentMetrics);
  renderContractorOptions(contractorRows, summary.latest_month);
  renderContractorBars(contractorRows, summary.latest_month);
  renderTimeline(monthlyMetrics);
  renderReconciliation(latestSummary);
  renderSource(summary, latestSummary, currentMetrics);

  document.getElementById("contractorSelect").addEventListener("change", (event) => {
    renderContractorBars(contractorRows, summary.latest_month, event.target.value);
  });
}

main().catch((error) => {
  console.error(error);
  document.getElementById("freshnessNote").textContent = "KPI dashboard failed to load source data.";
});
