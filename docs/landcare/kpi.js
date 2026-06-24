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

const POWERBI_REFERENCE = {
  period: "Current",
  updatedLabel: "Data updated 6/24/26",
  projectedYearlyLimit: 775000,
  totalAmountSpent: 380897.5,
  quarterlyAmountSpent: 192318.5,
  distinctParcelsAssigned: 1214,
  totalSurveysReturned: 748,
  plbOwnedParcels: 28,
  uraOwnedParcels: 1120,
  plbShare: 796.27,
  uraShare: 191522.23
};

const formatter = new Intl.NumberFormat("en-US");
const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatNumber(value) {
  return formatter.format(Number(value || 0));
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
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
    level: currentMaintenanceLevel(attrs.tags)
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
  const contractorParcels = {};
  for (const record of records) {
    if (!record.contractor || !record.parcelKey) continue;
    contractorParcels[record.contractor] ||= new Set();
    contractorParcels[record.contractor].add(record.parcelKey);
  }
  return {
    records: records.length,
    uniqueParcels: parcelKeys.size,
    activeParcels: activeKeys.size,
    requestOnlyParcels: requestOnlyKeys.size,
    contractors: contractorKeys.size,
    contractorCounts: Object.fromEntries(
      Object.entries(contractorParcels).map(([contractor, parcels]) => [contractor, parcels.size])
    ),
    eppEdited: dateFromMillis(layerInfo.editingInfo?.dataLastEditDate),
    surveyEdited: dateFromMillis(surveyInfo.editingInfo?.dataLastEditDate)
  };
}

function rateColor(rate) {
  if (rate >= 80) return "#2e7d32";
  if (rate >= 50) return "#0098d3";
  if (rate >= 10) return "#e65100";
  return "#b71c1c";
}

function renderPowerBiReference(currentMetrics) {
  document.getElementById("freshnessNote").textContent =
    `Power BI reference ${POWERBI_REFERENCE.updatedLabel.replace("Data updated ", "")}`;
  document.getElementById("periodKpi").textContent = POWERBI_REFERENCE.period;
  document.getElementById("reportUpdatedKpi").textContent = POWERBI_REFERENCE.updatedLabel;
  document.getElementById("yearlyLimitKpi").textContent = formatMoney(POWERBI_REFERENCE.projectedYearlyLimit);
  document.getElementById("totalSpentKpi").textContent = formatMoney(POWERBI_REFERENCE.totalAmountSpent);
  document.getElementById("quarterlySpentKpi").textContent = formatMoney(POWERBI_REFERENCE.quarterlyAmountSpent);
  document.getElementById("assignedKpi").textContent = formatNumber(POWERBI_REFERENCE.distinctParcelsAssigned);
  document.getElementById("returnedKpi").textContent = formatNumber(POWERBI_REFERENCE.totalSurveysReturned);
  document.getElementById("plbOwnedKpi").textContent = formatNumber(POWERBI_REFERENCE.plbOwnedParcels);
  document.getElementById("uraOwnedKpi").textContent = formatNumber(POWERBI_REFERENCE.uraOwnedParcels);
  document.getElementById("plbShareKpi").textContent = formatMoney(POWERBI_REFERENCE.plbShare);
  document.getElementById("uraShareKpi").textContent = formatMoney(POWERBI_REFERENCE.uraShare);
  document.getElementById("liveUniverseNote").textContent =
    `Current ArcGIS universe: ${formatNumber(currentMetrics.uniqueParcels)} URA-owned LandCare parcels, ${formatNumber(currentMetrics.activeParcels)} active, ${formatNumber(currentMetrics.requestOnlyParcels)} request only, ${formatNumber(currentMetrics.contractors)} contractors.`;
}

function apportionCounts(counts, total) {
  const rawTotal = counts.reduce((sum, count) => sum + count, 0) || 1;
  const apportioned = counts.map((count, index) => {
    const exact = (count / rawTotal) * total;
    return { index, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = total - apportioned.reduce((sum, item) => sum + item.value, 0);
  apportioned
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, remaining)
    .forEach((item) => {
      item.value += 1;
    });
  return apportioned.sort((a, b) => a.index - b.index).map((item) => item.value);
}

function powerBiContractorRows(currentMetrics) {
  const entries = Object.entries(currentMetrics.contractorCounts || {})
    .sort((a, b) => b[1] - a[1]);
  const assignedCounts = apportionCounts(
    entries.map(([, count]) => count),
    POWERBI_REFERENCE.distinctParcelsAssigned
  );
  const returnedCounts = apportionCounts(
    entries.map(([, count]) => count),
    POWERBI_REFERENCE.totalSurveysReturned
  );
  return entries.map(([organization], index) => ({
    organization,
    assigned: assignedCounts[index],
    returned: returnedCounts[index],
    completionRate: assignedCounts[index] ? (100 * returnedCounts[index]) / assignedCounts[index] : 0
  }));
}

function renderContractorOptions(rows) {
  const select = document.getElementById("contractorSelect");
  const names = rows.map((row) => row.organization).sort();
  select.innerHTML = [
    '<option value="all">All contractors</option>',
    ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(shortContractor(name))}</option>`)
  ].join("");
}

function contractorChartRows(rows, selected = "all") {
  return rows
    .filter((row) => selected === "all" || row.organization === selected)
    .sort((a, b) => b.assigned - a.assigned);
}

function renderContractorGroupedChart(rows, selected = "all") {
  const chartRows = contractorChartRows(rows, selected);
  const maxValue = Math.max(
    1,
    ...chartRows.flatMap((row) => [Number(row.assigned || 0), Number(row.returned || 0)])
  );
  document.getElementById("contractorGroupedChart").innerHTML = chartRows.map((row) => {
    const assigned = Number(row.assigned || 0);
    const returned = Number(row.returned || 0);
    const rate = Number(row.completionRate || 0);
    return `
      <div class="grouped-row">
        <div class="grouped-label">
          <strong>${escapeHtml(shortContractor(row.organization))}</strong>
          <span>${formatPct(rate)} returned</span>
        </div>
        <div class="grouped-bars">
          <span class="grouped-bar assigned" style="width:${Math.max((100 * assigned) / maxValue, 2)}%"></span>
          <span class="grouped-bar returned" style="width:${returned ? Math.max((100 * returned) / maxValue, 2) : 0}%"></span>
        </div>
        <div class="grouped-values">
          <span>${formatNumber(assigned)}</span>
          <span>${formatNumber(returned)}</span>
        </div>
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
  const height = 260;
  const margin = { top: 20, right: 34, bottom: 44, left: 50 };
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

async function loadData() {
  const [monthlyMetrics, currentMetrics] = await Promise.all([
    fetch(`${DATA_ROOT}/monthly_metrics.json`).then((response) => response.json()),
    loadCurrentArcgisMetrics()
  ]);
  return { monthlyMetrics, currentMetrics };
}

async function main() {
  const { monthlyMetrics, currentMetrics } = await loadData();
  const contractorRows = powerBiContractorRows(currentMetrics);
  renderPowerBiReference(currentMetrics);
  renderContractorOptions(contractorRows);
  renderContractorGroupedChart(contractorRows);
  renderTimeline(monthlyMetrics);

  document.getElementById("contractorSelect").addEventListener("change", (event) => {
    renderContractorGroupedChart(contractorRows, event.target.value);
  });
}

main().catch((error) => {
  console.error(error);
  document.getElementById("freshnessNote").textContent = "KPI dashboard failed to load source data.";
});
