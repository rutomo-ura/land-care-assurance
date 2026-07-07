import {
  SURVEY_LAYER_URL,
  SURVEY_AGOL_ITEM_URL,
  dateFromMillis,
  fetchArcgisJson,
  fetchSurveyLayerMetadata,
  fetchSurveyPeriodStats,
  enrichLatestMonthlyMetrics,
  enrichSummaryWithSurveyLayer,
  countReturnedAssigned,
  loadSurveyEvidenceByPeriod,
  mergeSurveyEvidenceIntoGeojson
} from "./survey-layer.js";

const DATA_ROOT = "../landcare/data";
const EPP_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_epp_parcels_full/FeatureServer/0";
const CURRENT_WHERE = "tags LIKE '%LandCare%' AND inventory_type = 'URA Owned'";
const CURRENT_OUT_FIELDS = [
  "OBJECTID",
  "parcel_number",
  "property_id",
  "inventory_type",
  "property_maint_mgr_name",
  "tags",
  "mod_dt",
  "par_calcacreag",
  "parcel_sqft"
].join(",");

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

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function formatAcres(value) {
  return `${formatter.format(Number(value || 0).toFixed(1))}`;
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

function quarterLabel(month) {
  const [year, rawMonth] = String(month).split("-");
  const quarter = Math.ceil(Number(rawMonth) / 3);
  return `Q${quarter} ${year}`;
}

function shortContractor(name) {
  return String(name || "Unassigned")
    .replace("FHCV Contracting LLC & LawnCare", "FHCV Contracting")
    .replace("Ervin Home Beautification", "Ervin Home")
    .replace("Operation Better Block", "Op. Better Block")
    .replace("One Call Handles It All", "One Call");
}

function normalizeContractorName(value) {
  return String(value || "Unassigned").replace(/\s+Primary Contact$/i, "") || "Unassigned";
}

function currentMaintenanceLevel(tags) {
  const text = String(tags || "");
  if (text.includes("LandCare - Request Only")) return "Request Only";
  if (text.includes("LandCare - Active")) return "Active";
  return "LandCare";
}

function normalizeCurrentRecord(attrs) {
  const parcelKey = attrs.parcel_number || attrs.property_id || `EPP-${attrs.OBJECTID}`;
  const sqft = Number(attrs.parcel_sqft || 0);
  const acres = Number(attrs.par_calcacreag || 0) || (sqft ? sqft / 43560 : 0);
  return {
    parcelKey,
    contractor: normalizeContractorName(attrs.property_maint_mgr_name),
    level: currentMaintenanceLevel(attrs.tags),
    sqft,
    acres
  };
}

async function fetchArcgisRecords(url, params) {
  const records = [];
  let offset = 0;
  const pageSize = Number(params.resultRecordCount || 2000);
  while (true) {
    const page = await fetchArcgisJson(`${url}/query`, {
      ...params,
      resultOffset: String(offset),
      resultRecordCount: String(pageSize)
    });
    records.push(...(page.features || []));
    if (!page.exceededTransferLimit || !(page.features || []).length) break;
    offset += pageSize;
  }
  return records;
}

function aggregateCurrentRecords(records) {
  const parcelKeys = new Set();
  const activeKeys = new Set();
  const requestOnlyKeys = new Set();
  const contractorParcels = {};
  const contractorAcres = {};
  const parcelArea = new Map();

  for (const record of records) {
    if (!record.parcelKey) continue;
    parcelKeys.add(record.parcelKey);
    if (!parcelArea.has(record.parcelKey)) {
      parcelArea.set(record.parcelKey, {
        contractor: record.contractor,
        acres: Number(record.acres || 0)
      });
    }
    if (record.level === "Active") activeKeys.add(record.parcelKey);
    if (record.level === "Request Only") requestOnlyKeys.add(record.parcelKey);
    if (!record.contractor) continue;
    contractorParcels[record.contractor] ||= new Set();
    contractorParcels[record.contractor].add(record.parcelKey);
  }

  for (const area of parcelArea.values()) {
    const contractor = area.contractor || "Unassigned";
    contractorAcres[contractor] = (contractorAcres[contractor] || 0) + area.acres;
  }

  const totalAcres = [...parcelArea.values()].reduce((sum, area) => sum + area.acres, 0);

  const contractorRows = Object.keys(contractorParcels)
    .map((contractor) => ({
      organization: contractor,
      currentParcels: contractorParcels[contractor].size,
      currentAcres: contractorAcres[contractor] || 0
    }))
    .sort((a, b) => b.currentParcels - a.currentParcels);

  return {
    records: records.length,
    uniqueParcels: parcelKeys.size,
    activeParcels: activeKeys.size,
    requestOnlyParcels: requestOnlyKeys.size,
    contractors: contractorRows.length,
    totalAcres,
    contractorRows
  };
}

async function loadCurrentArcgisMetrics() {
  const [layerInfo, surveyInfo, features] = await Promise.all([
    fetchArcgisJson(EPP_LAYER_URL, { f: "json" }),
    fetchSurveyLayerMetadata(),
    fetchArcgisRecords(EPP_LAYER_URL, {
      f: "json",
      where: CURRENT_WHERE,
      outFields: CURRENT_OUT_FIELDS,
      returnGeometry: "false",
      resultRecordCount: "2000",
      orderByFields: "property_maint_mgr_name ASC, parcel_number ASC"
    })
  ]);
  const metrics = aggregateCurrentRecords(
    features.map((feature) => normalizeCurrentRecord(feature.attributes || {}))
  );
  return {
    ...metrics,
    eppEdited: dateFromMillis(layerInfo.editingInfo?.dataLastEditDate),
    surveyEdited: surveyInfo?.dataLastEdit,
    surveyLayerUrl: surveyInfo?.serviceUrl,
    surveyLayerItemUrl: SURVEY_AGOL_ITEM_URL
  };
}

function aggregateContractorMonthly(rows) {
  const keyed = new Map();
  for (const row of rows) {
    const month = row.period_month;
    const organization = normalizeContractorName(row.organization);
    const key = `${month}|${organization}`;
    const prior = keyed.get(key) || {
      period_month: month,
      organization,
      assigned: 0,
      returned: 0
    };
    prior.assigned += Number(row.assigned_parcel_keys || 0);
    prior.returned += Number(row.returned_assigned_parcel_keys || 0);
    keyed.set(key, prior);
  }
  return Array.from(keyed.values()).map((row) => ({
    ...row,
    completionRate: row.assigned ? (100 * row.returned) / row.assigned : 0
  }));
}

function contractorRowsForMonth(contractorMonthly, month) {
  return contractorMonthly
    .filter((row) => row.period_month === month)
    .sort((a, b) => b.assigned - a.assigned);
}

function buildContractorDetailRows(currentRows, latestRows) {
  const byName = new Map();
  for (const row of currentRows) {
    byName.set(row.organization, {
      organization: row.organization,
      currentParcels: row.currentParcels,
      currentAcres: row.currentAcres,
      latestAssigned: 0,
      latestReturned: 0,
      latestRate: 0
    });
  }
  for (const row of latestRows) {
    const prior = byName.get(row.organization) || {
      organization: row.organization,
      currentParcels: 0,
      currentAcres: 0,
      latestAssigned: 0,
      latestReturned: 0,
      latestRate: 0
    };
    prior.latestAssigned = row.assigned;
    prior.latestReturned = row.returned;
    prior.latestRate = row.completionRate;
    byName.set(row.organization, prior);
  }
  return Array.from(byName.values()).sort((a, b) => b.currentParcels - a.currentParcels);
}

function renderSourceSummary(summary, currentMetrics) {
  const latestMonth = summary.latest_month;
  const surveyEdited = summary.survey_layer_summary?.data_last_edit || currentMetrics.surveyEdited;
  document.getElementById("freshnessNote").textContent = "Ready";
  document.getElementById("periodKpi").textContent =
    `${quarterLabel(latestMonth)} · ${shortMonth(latestMonth)}`;
  document.getElementById("reportUpdatedKpi").textContent =
    `${summary.generated_on || currentMetrics.eppEdited || "today"} · surveys ${surveyEdited || "live"}`;
  document.getElementById("liveUniverseNote").textContent =
    "Surveys: ArcGIS (daily). Assignments: published export.";
}

function appendFinanceSourceToSummary(financeSummary) {
  if (!financeSummary?.metadata) return;
}

function renderKpis(monthlyMetrics, summary, currentMetrics) {
  const latest = monthlyMetrics.at(-1);
  const latestYear = String(latest.period_month).slice(0, 4);
  const ytdRows = monthlyMetrics.filter((row) => String(row.period_month).startsWith(latestYear));
  const ytdReturned = ytdRows.reduce((sum, row) => sum + Number(row.returned_assigned || 0), 0);

  document.getElementById("currentParcelsKpi").textContent = formatNumber(currentMetrics.uniqueParcels);
  document.getElementById("currentActiveKpi").textContent = formatNumber(currentMetrics.activeParcels);
  document.getElementById("latestAssignedKpi").textContent = formatNumber(latest.assigned_active);
  document.getElementById("latestReturnedKpi").textContent = formatNumber(latest.returned_assigned);
  document.getElementById("latestCompletionKpi").textContent = formatPct(latest.active_completion_rate_pct);
  document.getElementById("ytdReturnedKpi").textContent = formatNumber(ytdReturned);
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
    .sort((a, b) => (b.assigned - b.returned) - (a.assigned - a.returned) || b.assigned - a.assigned);
}

function renderLeadershipInsights(monthlyMetrics, latestContractorRows, financeSummary) {
  const latest = monthlyMetrics.at(-1);
  const prior = monthlyMetrics.at(-2);
  const latestRate = Number(latest.active_completion_rate_pct || 0);
  const priorRate = Number(prior?.active_completion_rate_pct || 0);
  const delta = latestRate - priorRate;
  const contractorRows = [...latestContractorRows].map((row) => ({
    ...row,
    open: Math.max(Number(row.assigned || 0) - Number(row.returned || 0), 0)
  }));
  const largestOpen = contractorRows.sort((a, b) => b.open - a.open || a.completionRate - b.completionRate)[0];
  const openTotal = contractorRows.reduce((sum, row) => sum + row.open, 0);

  document.getElementById("completionReadoutInsight").textContent = formatPct(latestRate);
  const completionCopy = document.getElementById("completionReadoutCopy");
  completionCopy.textContent = prior
    ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts vs ${shortMonth(prior.period_month)}`
    : `${formatNumber(latest.returned_assigned)} of ${formatNumber(latest.assigned_active)} active`;
  completionCopy.className = `card-trend${prior ? (delta >= 0 ? " up" : " down") : ""}`;

  document.getElementById("openParcelInsight").textContent = formatNumber(openTotal);
  const openCopy = document.getElementById("openParcelCopy");
  openCopy.textContent = largestOpen?.open
    ? `Most open: ${shortContractor(largestOpen.organization)} (${formatNumber(largestOpen.open)})`
    : "All active returned";
  openCopy.className = "card-trend";

  document.getElementById("budgetRunRateInsight").textContent =
    formatMoney(financeSummary?.summary?.annual_invoice_run_rate || 0);
  const budgetCopy = document.getElementById("budgetRunRateCopy");
  budgetCopy.textContent =
    `${formatMoney(financeSummary?.summary?.monthly_invoice_total || 0)}/mo · ${formatNumber(financeSummary?.summary?.organization_count || 0)} contractors`;
  budgetCopy.className = "card-trend";
}

function renderContractorGroupedChart(rows, selected = "all", latestMonth = "") {
  const chartRows = contractorChartRows(rows, selected);
  const maxValue = Math.max(
    1,
    ...chartRows.map((row) => Number(row.assigned || 0))
  );
  const openTotal = chartRows.reduce((sum, row) => sum + Math.max(Number(row.assigned || 0) - Number(row.returned || 0), 0), 0);
  const summaryEl = document.getElementById("contractorQueueSummary");
  if (summaryEl) {
    summaryEl.textContent = latestMonth
      ? `${shortMonth(latestMonth)} · ${formatNumber(openTotal)} open across ${chartRows.length} contractors`
      : `${formatNumber(openTotal)} open`;
  }
  document.getElementById("contractorGroupedChart").innerHTML = chartRows.map((row) => {
    const assigned = Number(row.assigned || 0);
    const returned = Number(row.returned || 0);
    const open = Math.max(assigned - returned, 0);
    const rate = Number(row.completionRate || 0);
    const returnedWidth = assigned ? (100 * returned) / assigned : 0;
    const openWidth = assigned ? (100 * open) / assigned : 0;
    return `
      <div class="grouped-row">
        <div class="grouped-label">
          <strong>${escapeHtml(shortContractor(row.organization))}</strong>
          <span>${formatPct(rate)} · ${formatNumber(open)} open</span>
        </div>
        <div class="stacked-bars" style="width:${Math.max((100 * assigned) / maxValue, 4)}%">
          <span class="stacked-segment returned" style="width:${returned ? Math.max(returnedWidth, 2) : 0}%"></span>
          <span class="stacked-segment open" style="width:${open ? Math.max(openWidth, 2) : 0}%"></span>
        </div>
        <div class="grouped-values">
          <span>${formatNumber(returned)}/${formatNumber(assigned)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderAreaDistribution(rows) {
  const maxAcres = Math.max(1, ...rows.map((row) => Number(row.currentAcres || 0)));
  document.getElementById("areaDistributionChart").innerHTML = rows.map((row) => `
    <div class="grouped-row single-bar-row">
      <div class="grouped-label">
        <strong>${escapeHtml(shortContractor(row.organization))}</strong>
        <span>${formatNumber(row.currentParcels)} parcels</span>
      </div>
      <div class="grouped-bars">
        <span class="grouped-bar assigned" style="width:${Math.max((100 * row.currentAcres) / maxAcres, 2)}%"></span>
      </div>
      <div class="grouped-values">
        <span>${formatAcres(row.currentAcres)} ac</span>
      </div>
    </div>
  `).join("");
}

function renderMoneyBarChart(containerId, rows, valueKey, valueFormatter = formatMoney) {
  const sortedRows = [...rows].sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0));
  const maxValue = Math.max(1, ...sortedRows.map((row) => Number(row[valueKey] || 0)));
  document.getElementById(containerId).innerHTML = sortedRows.map((row) => {
    const value = Number(row[valueKey] || 0);
    return `
      <div class="grouped-row single-bar-row">
        <div class="grouped-label">
          <strong>${escapeHtml(shortContractor(row.organization))}</strong>
          <span>${formatNumber(row.parcels)} parcels / ${formatAcres(row.acres)} ac</span>
        </div>
        <div class="grouped-bars">
          <span class="grouped-bar assigned" style="width:${Math.max((100 * value) / maxValue, 2)}%"></span>
        </div>
        <div class="grouped-values">
          <span>${valueFormatter(value)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderFinance(financeSummary) {
  const summary = financeSummary.summary || {};
  const rows = financeSummary.current_contracts || [];
  const historyRows = financeSummary.check_request_history || [];
  document.getElementById("annualRunRateKpi").textContent = formatMoney(summary.annual_invoice_run_rate);
  document.getElementById("monthlyInvoiceKpi").textContent = formatMoney(summary.monthly_invoice_total);
  document.getElementById("totalContractKpi").textContent = formatMoney(summary.total_contract_amount);
  document.getElementById("financeContractorsKpi").textContent = formatNumber(summary.organization_count);
  document.getElementById("annualCostPerAcreKpi").textContent = formatMoney(summary.annual_cost_per_acre);
  document.getElementById("monthlyCostPerParcelKpi").textContent = formatMoney(summary.monthly_cost_per_parcel);
  document.getElementById("contractAcresKpi").textContent = `${formatAcres(summary.acres)} ac`;
  document.getElementById("contractParcelsKpi").textContent = formatNumber(summary.parcel_count);
  renderMoneyBarChart("budgetContractChart", rows, "annual_invoice_run_rate");
  renderMoneyBarChart("expenseIntensityChart", rows, "annual_cost_per_acre");
  renderCheckRequestTable(historyRows);
  renderMaintenanceExpenseTable(rows);
  const note = `Finance workbook · refreshed ${financeSummary.metadata?.generated_on || "unknown"}`;
  document.getElementById("financeSourceNote").textContent = note;
  document.getElementById("expenseSourceNote").textContent = note;
}

function renderTimeline(monthlyMetrics) {
  renderLineChart(monthlyMetrics);
  const latest = monthlyMetrics.at(-1);
  const prior = monthlyMetrics.at(-2);
  const latestRate = Number(latest.active_completion_rate_pct || 0);
  const priorRate = Number(prior?.active_completion_rate_pct || 0);
  const delta = latestRate - priorRate;
  const avgRate = monthlyMetrics.reduce((sum, row) => sum + Number(row.active_completion_rate_pct || 0), 0) / monthlyMetrics.length;
  const summaryEl = document.getElementById("trendSummary");
  if (summaryEl) {
    summaryEl.textContent = `${monthlyMetrics.length} months · avg ${formatPct(avgRate)} · latest ${formatPct(latestRate)}${prior ? ` (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts)` : ""}`;
  }
}

const COMPLETION_TARGET = 80;

function renderLineChart(monthlyMetrics) {
  const container = document.getElementById("completionLineChart");
  const width = 720;
  const height = 240;
  const margin = { top: 18, right: 42, bottom: 48, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = monthlyMetrics.map((row) => Number(row.active_completion_rate_pct || 0));
  const maxValue = Math.max(COMPLETION_TARGET + 5, Math.ceil(Math.max(...values, COMPLETION_TARGET) / 10) * 10);
  const toX = (index) =>
    margin.left + (monthlyMetrics.length === 1 ? plotWidth / 2 : (index / (monthlyMetrics.length - 1)) * plotWidth);
  const toY = (value) => margin.top + plotHeight - (value / maxValue) * plotHeight;
  const points = monthlyMetrics.map((row, index) => [toX(index), toY(Number(row.active_completion_rate_pct || 0))]);
  const linePath = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1)[0].toFixed(1)},${(margin.top + plotHeight).toFixed(1)} L${points[0][0].toFixed(1)},${(margin.top + plotHeight).toFixed(1)} Z`;
  const yTicks = [0, COMPLETION_TARGET, maxValue].filter((tick, index, arr) => index === 0 || tick !== arr[index - 1]);

  const hitMarkup = points.map(([x, y], index) => {
    const row = monthlyMetrics[index];
    const rate = values[index];
    const returned = Number(row.returned_assigned || 0);
    const assigned = Number(row.assigned_active || 0);
    const priorRate = index > 0 ? values[index - 1] : null;
    const delta = priorRate !== null ? rate - priorRate : null;
    const deltaClass = delta === null ? "" : delta >= 0 ? " up" : " down";
    const deltaText = delta === null ? "Baseline month" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`;
    const leftPct = (x / width) * 100;
    const topPct = (y / height) * 100;
    return `
      <button
        type="button"
        class="chart-hit"
        style="left:${leftPct.toFixed(2)}%; top:${topPct.toFixed(2)}%"
        aria-label="${escapeHtml(shortMonth(row.period_month))}: ${formatPct(rate)}, ${formatNumber(returned)} of ${formatNumber(assigned)} returned"
      >
        <span class="chart-hit-dot" aria-hidden="true"></span>
        <div class="chart-tooltip-card" role="tooltip">
          <span class="chart-tooltip-month">${escapeHtml(shortMonth(row.period_month))}</span>
          <strong class="chart-tooltip-rate">${formatPct(rate)}</strong>
          <span class="chart-tooltip-delta${deltaClass}">${escapeHtml(deltaText)}</span>
          <span class="chart-tooltip-count">${formatNumber(returned)} / ${formatNumber(assigned)} returned</span>
        </div>
      </button>
    `;
  }).join("");

  container.innerHTML = `
    <div class="line-chart-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Active completion rate over time">
        ${yTicks.map((tick) => {
          const y = toY(tick);
          const isTarget = tick === COMPLETION_TARGET;
          return `
            <line class="${isTarget ? "chart-target" : "chart-grid"}" x1="${margin.left}" x2="${width - margin.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line>
            <text class="chart-tick${isTarget ? " chart-tick-target" : ""}" x="${margin.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${tick}%</text>
          `;
        }).join("")}
        <line class="chart-axis" x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}"></line>
        <line class="chart-axis" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}"></line>
        <path class="chart-area" d="${areaPath}"></path>
        <path class="chart-line" d="${linePath}"></path>
        ${points.map(([x, y], index) => `
          <text class="chart-count-label" x="${x.toFixed(1)}" y="${(height - 18).toFixed(1)}" text-anchor="middle">${shortMonth(monthlyMetrics[index].period_month)}</text>
        `).join("")}
      </svg>
      <div class="chart-overlay">${hitMarkup}</div>
    </div>
  `;
}

function renderTable(table, columns, rows) {
  table.innerHTML = `
    <thead>
      <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          ${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
}

function renderSubmissionRateTable(monthlyMetrics) {
  renderTable(
    document.getElementById("submissionRateTable"),
    [
      { label: "Month", value: (row) => shortMonth(row.period_month) },
      { label: "Assigned", value: (row) => formatNumber(row.assigned_total) },
      { label: "Active Assigned", value: (row) => formatNumber(row.assigned_active) },
      { label: "Returned", value: (row) => formatNumber(row.returned_assigned) },
      { label: "Active Completion", value: (row) => formatPct(row.active_completion_rate_pct) },
      { label: "Blended Completion", value: (row) => formatPct(row.blended_completion_rate_pct) }
    ],
    [...monthlyMetrics].reverse()
  );
}

function renderParcelDetailsTable(rows) {
  renderTable(
    document.getElementById("parcelDetailsTable"),
    [
      { label: "Contractor", value: (row) => shortContractor(row.organization) },
      { label: "Inventory Parcels", value: (row) => formatNumber(row.currentParcels) },
      { label: "Current Acres", value: (row) => `${formatAcres(row.currentAcres)} ac` },
      { label: "Latest Assigned", value: (row) => formatNumber(row.latestAssigned) },
      { label: "Latest Returned", value: (row) => formatNumber(row.latestReturned) },
      { label: "Latest Rate", value: (row) => formatPct(row.latestRate) }
    ],
    rows
  );
}

function renderCheckRequestTable(rows) {
  renderTable(
    document.getElementById("checkRequestTable"),
    [
      { label: "Organization", value: (row) => shortContractor(row.organization) },
      { label: "Start", value: (row) => row.start_date },
      { label: "End", value: (row) => row.end_date },
      { label: "Parcels", value: (row) => formatNumber(row.parcels) },
      { label: "Invoice Amount", value: (row) => formatMoney(row.invoice_amount) },
      { label: "MR Check Note", value: (row) => row.mr_check_note || "" }
    ],
    rows
  );
}

function renderMaintenanceExpenseTable(rows) {
  renderTable(
    document.getElementById("maintenanceExpenseTable"),
    [
      { label: "Organization", value: (row) => shortContractor(row.organization) },
      { label: "Parcels", value: (row) => formatNumber(row.parcels) },
      { label: "Acres", value: (row) => formatAcres(row.acres) },
      { label: "Monthly Invoice", value: (row) => formatMoney(row.monthly_invoice_amount) },
      { label: "Annual Run Rate", value: (row) => formatMoney(row.annual_invoice_run_rate) },
      { label: "Monthly / Parcel", value: (row) => formatMoney(row.monthly_cost_per_parcel) },
      { label: "Annual / Acre", value: (row) => formatMoney(row.annual_cost_per_acre) }
    ],
    rows
  );
}

function setupTabs() {
  const buttons = Array.from(document.querySelectorAll(".report-tabs button"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tab));
    });
  }
}

async function loadData() {
  const [monthlyMetrics, contractorMonthlyRaw, summary, financeSummary, currentMetrics, allMonthsGeojson, surveyPeriodStats] =
    await Promise.all([
      fetch(`${DATA_ROOT}/monthly_metrics.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/contractor_monthly.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/kpi_summary.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/finance_summary.json`).then((response) => response.json()),
      loadCurrentArcgisMetrics(),
      fetch(`${DATA_ROOT}/all_months.geojson`).then((response) => response.json()),
      fetchSurveyPeriodStats().catch(() => [])
    ]);

  const enrichedSummary = enrichSummaryWithSurveyLayer(summary, await fetchSurveyLayerMetadata().catch(() => null), surveyPeriodStats);
  const evidenceByPeriod = await loadSurveyEvidenceByPeriod(enrichedSummary.available_months).catch(() => ({}));
  const mergedGeojson = mergeSurveyEvidenceIntoGeojson(allMonthsGeojson, evidenceByPeriod);
  const latestMonth = enrichedSummary.latest_month || monthlyMetrics.at(-1)?.period_month;
  const liveReturnedAssigned = countReturnedAssigned(mergedGeojson.features, latestMonth);
  const enrichedMonthlyMetrics = enrichLatestMonthlyMetrics(monthlyMetrics, latestMonth, liveReturnedAssigned);

  return {
    monthlyMetrics: enrichedMonthlyMetrics,
    contractorMonthly: aggregateContractorMonthly(contractorMonthlyRaw),
    financeSummary,
    summary: enrichedSummary,
    currentMetrics
  };
}

async function main() {
  setupTabs();
  const { monthlyMetrics, contractorMonthly, financeSummary, summary, currentMetrics } = await loadData();
  const latestMonth = summary.latest_month || monthlyMetrics.at(-1).period_month;
  const latestContractorRows = contractorRowsForMonth(contractorMonthly, latestMonth);
  const detailRows = buildContractorDetailRows(currentMetrics.contractorRows, latestContractorRows);

  renderSourceSummary(summary, currentMetrics);
  appendFinanceSourceToSummary(financeSummary);
  renderKpis(monthlyMetrics, summary, currentMetrics);
  renderLeadershipInsights(monthlyMetrics, latestContractorRows, financeSummary);
  renderContractorOptions(latestContractorRows);
  renderContractorGroupedChart(latestContractorRows, "all", latestMonth);
  renderTimeline(monthlyMetrics);
  renderSubmissionRateTable(monthlyMetrics);
  renderAreaDistribution(currentMetrics.contractorRows);
  renderParcelDetailsTable(detailRows);
  renderFinance(financeSummary);

  document.getElementById("contractorSelect").addEventListener("change", (event) => {
    renderContractorGroupedChart(latestContractorRows, event.target.value, latestMonth);
  });
}

main().catch((error) => {
  console.error(error);
  document.getElementById("freshnessNote").textContent = "KPI dashboard failed to load source data.";
});
