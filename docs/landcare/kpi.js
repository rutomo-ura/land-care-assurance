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
import {
  enrichSummaryWithAssignmentLayers,
  fetchAssignmentHistoryGeojson,
  fetchAssignmentLayerMetadata,
  fetchAssignmentPeriodStats,
  ASSIGNMENT_CURRENT_LAYER_NAME,
  ASSIGNMENT_CURRENT_LAYER_URL,
  ASSIGNMENT_CURRENT_AGOL_ITEM_ID,
  ASSIGNMENT_CURRENT_AGOL_ITEM_URL,
  ASSIGNMENT_HISTORY_LAYER_NAME,
  ASSIGNMENT_HISTORY_LAYER_URL,
  ASSIGNMENT_HISTORY_AGOL_ITEM_ID,
  ASSIGNMENT_HISTORY_AGOL_ITEM_URL
} from "./assignment-layer.js";

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
const compactMoneyFormatter = new Intl.NumberFormat("en-US", {
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

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function formatMoneyCompact(value) {
  return compactMoneyFormatter.format(Number(value || 0));
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

function hasReportedSurveyData(row) {
  return Number(row?.survey_rows_raw || 0) > 0;
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

function aggregateLiveMonthlyMetrics(geojson, surveyPeriodStats) {
  const keyed = new Map();
  for (const feature of geojson.features || []) {
    const props = feature.properties || {};
    const month = props.period_month;
    const parcelKey = props.parcel_key;
    if (!month || !parcelKey) continue;
    const row = keyed.get(month) || {
      period_month: month,
      activeKeys: new Set(),
      totalKeys: new Set(),
      returnedKeys: new Set(),
      requestOnlyKeys: new Set()
    };
    row.totalKeys.add(parcelKey);
    if (props.maintenance_level === "Request Only") row.requestOnlyKeys.add(parcelKey);
    if (props.maintenance_level === "Active") {
      row.activeKeys.add(parcelKey);
      if (props.returned_flag) row.returnedKeys.add(parcelKey);
    }
    keyed.set(month, row);
  }
  return [...keyed.values()]
    .sort((a, b) => a.period_month.localeCompare(b.period_month))
    .map((row) => {
      const assignedActive = row.activeKeys.size;
      const assignedTotal = row.totalKeys.size;
      const returned = row.returnedKeys.size;
      const rawSurveys = Number(
        (surveyPeriodStats || []).find((stat) => stat.period_label === row.period_month)?.record_count || returned
      );
      return {
        period_month: row.period_month,
        assigned_active: assignedActive,
        assigned_total: assignedTotal,
        returned_assigned: returned,
        request_only: row.requestOnlyKeys.size,
        open_active: Math.max(assignedActive - returned, 0),
        survey_rows_raw: rawSurveys,
        active_completion_rate_pct: assignedActive ? Math.round((1000 * returned) / assignedActive) / 10 : 0,
        blended_completion_rate_pct: assignedTotal ? Math.round((1000 * returned) / assignedTotal) / 10 : 0,
        survey_only_records: Math.max(rawSurveys - returned, 0),
        source: "live_arcgis_assignment_and_survey_layers"
      };
    });
}

function aggregateLiveContractorMonthly(geojson) {
  const keyed = new Map();
  for (const feature of geojson.features || []) {
    const props = feature.properties || {};
    if (!props.period_month || !props.parcel_key || props.maintenance_level !== "Active") continue;
    const organization = normalizeContractorName(props.organization);
    const key = `${props.period_month}|${organization}`;
    const row = keyed.get(key) || {
      period_month: props.period_month,
      organization,
      assignedKeys: new Set(),
      returnedKeys: new Set()
    };
    row.assignedKeys.add(props.parcel_key);
    if (props.returned_flag) row.returnedKeys.add(props.parcel_key);
    keyed.set(key, row);
  }
  return [...keyed.values()].map((row) => {
    const assigned = row.assignedKeys.size;
    const returned = row.returnedKeys.size;
    return {
      period_month: row.period_month,
      organization: row.organization,
      assigned,
      returned,
      completionRate: assigned ? (100 * returned) / assigned : 0
    };
  });
}

function contractorRowsForMonth(contractorMonthly, month) {
  return contractorMonthly
    .filter((row) => row.period_month === month)
    .sort((a, b) => b.assigned - a.assigned);
}

function metricForMonth(monthlyMetrics, month) {
  return monthlyMetrics.find((row) => row.period_month === month) || monthlyMetrics.at(-1);
}

function priorMetricForMonth(monthlyMetrics, month) {
  const index = monthlyMetrics.findIndex((row) => row.period_month === month);
  return index > 0 ? monthlyMetrics[index - 1] : null;
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

function renderMonthOptions(monthlyMetrics, selectedMonth) {
  const select = document.getElementById("kpiMonthSelect");
  if (!select) return;
  select.innerHTML = monthlyMetrics
    .map((row) => `<option value="${escapeHtml(row.period_month)}">${escapeHtml(shortMonth(row.period_month))}</option>`)
    .join("");
  select.value = selectedMonth;
}

function renderSourceSummary(summary, currentMetrics, selectedMonth) {
  const latestMonth = selectedMonth;
  const surveyEdited = summary.survey_layer_summary?.data_last_edit || currentMetrics.surveyEdited;
  document.getElementById("freshnessNote").textContent = "Ready";
  document.getElementById("periodKpi").textContent =
    `${quarterLabel(latestMonth)} · ${shortMonth(latestMonth)}`;
  document.getElementById("reportUpdatedKpi").textContent =
    `${summary.generated_on || currentMetrics.eppEdited || "today"} · surveys ${surveyEdited || "live"}`;
  document.getElementById("liveUniverseNote").textContent =
    `Surveys: live ArcGIS all-period layer. Assignments: ${summary.assignment_source === "gisdb_gis_regrid_bundle_assignments_history" ? "live ArcGIS history snapshot" : "published fallback"}.`;
}

function appendFinanceSourceToSummary(financeSummary) {
  if (!financeSummary?.metadata) return;
}

function renderKpis(monthlyMetrics, summary, currentMetrics, selectedMonth) {
  const latest = metricForMonth(monthlyMetrics, selectedMonth);
  const latestSurveyRecords = Number(
    latest.period_month === summary.latest_month
      ? summary.live_latest_survey_record_count ?? latest.survey_rows_raw ?? 0
      : latest.survey_rows_raw ?? 0
  );

  document.getElementById("currentParcelsKpi").textContent = formatNumber(currentMetrics.uniqueParcels);
  document.getElementById("currentActiveKpi").textContent = formatNumber(currentMetrics.activeParcels);
  const periodStatus = document.getElementById("periodStatusKpi");
  const periodStatusCard = document.getElementById("periodStatusCard");
  const isReported = hasReportedSurveyData({ ...latest, survey_rows_raw: latestSurveyRecords });
  periodStatus.textContent = isReported ? "Reported" : "Awaiting submissions";
  periodStatusCard.classList.toggle("is-pending", !isReported);
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

function renderCompletionKpi(containerId, latest, monthlyMetrics, isReported) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rate = Math.max(0, Math.min(100, Number(latest.active_completion_rate_pct || 0)));
  const reportedMetrics = monthlyMetrics.filter(hasReportedSurveyData);
  const lastReported = reportedMetrics.filter((row) => row.period_month <= latest.period_month).at(-1);

  if (!isReported) {
    container.setAttribute("aria-label", `Completion for ${shortMonth(latest.period_month)} is awaiting submissions`);
    container.innerHTML = `
      <div class="completion-primary">
        <strong>Pending</strong>
        <span>${escapeHtml(shortMonth(latest.period_month))}</span>
      </div>
      <div class="completion-baseline">
        <span>Last reported</span>
        <strong>${lastReported ? `${escapeHtml(shortMonth(lastReported.period_month))} · ${formatPct(lastReported.active_completion_rate_pct)}` : "Not available"}</strong>
      </div>
    `;
    return;
  }

  const targetGap = COMPLETION_TARGET - rate;
  const targetContext = targetGap > 0
    ? `${targetGap.toFixed(1)} pts below`
    : targetGap < 0
      ? `${Math.abs(targetGap).toFixed(1)} pts above`
      : "On target";
  container.setAttribute("aria-label", `Active completion ${formatPct(rate)} against an ${COMPLETION_TARGET}% target`);
  container.innerHTML = `
    <div class="completion-primary">
      <strong>${formatPct(rate)}</strong>
      <span>Active completion</span>
    </div>
    <progress class="completion-progress" max="100" value="${rate}" aria-label="${formatPct(rate)} of ${COMPLETION_TARGET}% target"></progress>
    <div class="completion-target-row">
      <span>${COMPLETION_TARGET}% target</span>
      <strong>${targetContext}</strong>
    </div>
  `;
}

const COMPLETION_TARGET = 80;

function chartPointTooltip(row, rate, delta) {
  const deltaClass = delta === null ? "" : delta >= 0 ? " up" : " down";
  const deltaText = delta === null ? "Baseline month" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`;
  const returned = Number(row.returned_assigned || 0);
  const assigned = Number(row.assigned_active || 0);
  return `
    <span class="chart-tooltip-month">${escapeHtml(shortMonth(row.period_month))}</span>
    <strong class="chart-tooltip-rate">${formatPct(rate)}</strong>
    <span class="chart-tooltip-delta${deltaClass}">${escapeHtml(deltaText)}</span>
    <span class="chart-tooltip-count">${formatNumber(returned)} / ${formatNumber(assigned)} returned</span>
  `;
}

function bindLineChartTooltips(container, monthlyMetrics) {
  const shell = container.querySelector(".line-chart-shell");
  const tooltip = container.querySelector(".chart-floating-tooltip");
  if (!shell || !tooltip) return;

  const show = (marker) => {
    const index = Number(marker.dataset.pointIndex);
    const row = monthlyMetrics[index];
    if (!row) return;
    const rate = Number(row.active_completion_rate_pct || 0);
    const priorRate = index > 0 ? Number(monthlyMetrics[index - 1].active_completion_rate_pct || 0) : null;
    const delta = priorRate !== null ? rate - priorRate : null;
    tooltip.innerHTML = chartPointTooltip(row, rate, delta);
    tooltip.removeAttribute("hidden");
    tooltip.classList.add("is-visible");
    const shellRect = shell.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    tooltip.style.left = `${markerRect.left - shellRect.left + markerRect.width / 2}px`;
    tooltip.style.top = `${markerRect.top - shellRect.top}px`;
    marker.setAttribute("r", "7");
    marker.classList.add("is-active");
  };

  const hide = (marker) => {
    tooltip.setAttribute("hidden", "");
    tooltip.classList.remove("is-visible");
    if (marker) {
      marker.setAttribute("r", "6");
      marker.classList.remove("is-active");
    }
  };

  for (const marker of container.querySelectorAll(".chart-marker")) {
    marker.addEventListener("mouseenter", () => show(marker));
    marker.addEventListener("focus", () => show(marker));
    marker.addEventListener("mouseleave", () => hide(marker));
    marker.addEventListener("blur", () => hide(marker));
  }
}

function renderLeadershipInsights(monthlyMetrics, latestContractorRows, financeSummary, selectedMonth) {
  const latest = metricForMonth(monthlyMetrics, selectedMonth);
  const prior = priorMetricForMonth(monthlyMetrics, selectedMonth);
  const latestRate = Number(latest.active_completion_rate_pct || 0);
  const priorRate = Number(prior?.active_completion_rate_pct || 0);
  const delta = latestRate - priorRate;
  const isReported = hasReportedSurveyData(latest);
  const contractorRows = [...latestContractorRows].map((row) => ({
    ...row,
    open: Math.max(Number(row.assigned || 0) - Number(row.returned || 0), 0)
  }));
  const largestOpen = contractorRows.sort((a, b) => b.open - a.open || a.completionRate - b.completionRate)[0];
  const openTotal = contractorRows.reduce((sum, row) => sum + row.open, 0);

  renderCompletionKpi("completionGauge", latest, monthlyMetrics, isReported);
  const completionCard = document.getElementById("completionInsightCard");
  const completionStatus = document.getElementById("completionStatusChip");
  completionCard.classList.toggle("is-pending", !isReported);
  completionStatus.classList.toggle("is-pending", !isReported);
  completionStatus.textContent = isReported ? "Reported" : "Awaiting data";
  const completionCopy = document.getElementById("completionReadoutCopy");
  completionCopy.textContent = !isReported
    ? `Survey evidence has not arrived · ${formatNumber(latest.assigned_active)} active assignments`
    : prior
    ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts vs ${shortMonth(prior.period_month)}`
    : `${formatNumber(latest.returned_assigned)} of ${formatNumber(latest.assigned_active)} active`;
  completionCopy.className = `card-trend${isReported && prior ? (delta >= 0 ? " up" : " down") : ""}`;

  document.getElementById("openParcelInsight").textContent = formatNumber(openTotal);
  const openCopy = document.getElementById("openParcelCopy");
  openCopy.textContent = largestOpen?.open
    ? `Most open: ${shortContractor(largestOpen.organization)} (${formatNumber(largestOpen.open)})`
    : "All active returned";
  openCopy.className = "card-trend";

  document.getElementById("budgetRunRateInsight").textContent =
    formatMoneyCompact(financeSummary?.summary?.annual_invoice_run_rate || 0);
  const budgetCopy = document.getElementById("budgetRunRateCopy");
  budgetCopy.textContent =
    `${formatMoneyCompact(financeSummary?.summary?.monthly_invoice_total || 0)}/mo · ${formatNumber(financeSummary?.summary?.organization_count || 0)} contractors`;
  budgetCopy.className = "card-trend";
}

function renderContractorGroupedChart(rows, selected = "all", latestMonth = "") {
  const allChartRows = contractorChartRows(rows, selected);
  const chartRows = selected === "all" ? allChartRows.slice(0, 5) : allChartRows;
  const maxValue = Math.max(
    1,
    ...chartRows.map((row) => Number(row.assigned || 0))
  );
  const openTotal = allChartRows.reduce((sum, row) => sum + Math.max(Number(row.assigned || 0) - Number(row.returned || 0), 0), 0);
  const summaryEl = document.getElementById("contractorQueueSummary");
  if (summaryEl) {
    summaryEl.textContent = latestMonth
      ? `${shortMonth(latestMonth)} · ${formatNumber(openTotal)} open${allChartRows.length > chartRows.length ? ` · top ${chartRows.length} of ${allChartRows.length} contractors` : ` across ${chartRows.length} contractors`}`
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

function renderTimeline(monthlyMetrics, selectedMonth = monthlyMetrics.at(-1)?.period_month) {
  const latest = metricForMonth(monthlyMetrics, selectedMonth);
  const prior = priorMetricForMonth(monthlyMetrics, selectedMonth);
  const reportedMetrics = monthlyMetrics.filter(hasReportedSurveyData);
  renderLineChart(reportedMetrics.length ? reportedMetrics : monthlyMetrics);
  const latestRate = Number(latest.active_completion_rate_pct || 0);
  const priorRate = Number(prior?.active_completion_rate_pct || 0);
  const delta = latestRate - priorRate;
  const avgRate = reportedMetrics.reduce((sum, row) => sum + Number(row.active_completion_rate_pct || 0), 0) / Math.max(reportedMetrics.length, 1);
  const summaryEl = document.getElementById("trendSummary");
  if (summaryEl) {
    summaryEl.textContent = hasReportedSurveyData(latest)
      ? `${reportedMetrics.length} reported months · avg ${formatPct(avgRate)} · selected ${formatPct(latestRate)}${prior ? ` (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts)` : ""}`
      : `${reportedMetrics.length} reported months · avg ${formatPct(avgRate)} · ${shortMonth(latest.period_month)} awaiting submissions`;
  }
}

function renderLineChart(monthlyMetrics) {
  const container = document.getElementById("completionLineChart");
  const width = 720;
  const height = 260;
  const margin = { top: 22, right: 42, bottom: 44, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = monthlyMetrics.map((row) => Number(row.active_completion_rate_pct || 0));
  const maxValue = 100;
  const toX = (index) =>
    margin.left + (monthlyMetrics.length === 1 ? plotWidth / 2 : (index / (monthlyMetrics.length - 1)) * plotWidth);
  const toY = (value) => margin.top + plotHeight - (Math.max(0, Math.min(maxValue, Number(value || 0))) / maxValue) * plotHeight;
  const points = monthlyMetrics.map((row, index) => [toX(index), toY(row.active_completion_rate_pct)]);
  const linePath = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1)[0].toFixed(1)},${(margin.top + plotHeight).toFixed(1)} L${points[0][0].toFixed(1)},${(margin.top + plotHeight).toFixed(1)} Z`;
  const yTicks = [0, COMPLETION_TARGET, maxValue];

  container.innerHTML = `
    <div class="line-chart-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Active completion rate over time">
        <defs>
          <linearGradient id="completionAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0098d3" stop-opacity="0.34"></stop>
            <stop offset="100%" stop-color="#0098d3" stop-opacity="0.04"></stop>
          </linearGradient>
          <linearGradient id="completionLineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#006c9f"></stop>
            <stop offset="100%" stop-color="#0098d3"></stop>
          </linearGradient>
        </defs>
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
        ${points.map(([x, y], index) => {
          const row = monthlyMetrics[index];
          const rate = values[index];
          const returned = Number(row.returned_assigned || 0);
          const assigned = Number(row.assigned_active || 0);
          return `
            <g class="chart-point">
              <circle
                class="chart-marker"
                cx="${x.toFixed(1)}"
                cy="${y.toFixed(1)}"
                r="6"
                data-point-index="${index}"
                tabindex="0"
                role="button"
                aria-label="${escapeHtml(shortMonth(row.period_month))}: ${formatPct(rate)}, ${formatNumber(returned)} of ${formatNumber(assigned)} returned"
              ></circle>
              <text class="chart-value-label" x="${x.toFixed(1)}" y="${(y - 12).toFixed(1)}" text-anchor="middle">${formatPct(rate)}</text>
              <text class="chart-count-label" x="${x.toFixed(1)}" y="${(height - 18).toFixed(1)}" text-anchor="middle">${shortMonth(row.period_month)}</text>
            </g>
          `;
        }).join("")}
      </svg>
      <div class="chart-floating-tooltip" hidden></div>
    </div>
  `;

  bindLineChartTooltips(container, monthlyMetrics);
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
      { label: "Period Assigned", value: (row) => formatNumber(row.latestAssigned) },
      { label: "Period Returned", value: (row) => formatNumber(row.latestReturned) },
      { label: "Period Rate", value: (row) => formatPct(row.latestRate) }
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
    const tab = button.dataset.tab;
    const panel = panels.find((item) => item.dataset.panel === tab);
    button.id = `report-tab-${tab}`;
    if (panel) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", button.id);
      panel.setAttribute("aria-hidden", String(!panel.classList.contains("is-active")));
    }
    button.addEventListener("click", () => {
      buttons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });
      panels.forEach((panel) => {
        const isActive = panel.dataset.panel === tab;
        panel.classList.toggle("is-active", isActive);
        panel.setAttribute("aria-hidden", String(!isActive));
      });
    });
  }
}

async function loadData() {
  const [monthlyMetrics, contractorMonthlyRaw, summary, financeSummary, currentMetrics, allMonthsGeojson, surveyPeriodStats, assignmentCurrentMetadata, assignmentHistoryMetadata, assignmentPeriodStats, assignmentHistoryResult] =
    await Promise.all([
      fetch(`${DATA_ROOT}/monthly_metrics.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/contractor_monthly.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/kpi_summary.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/finance_summary.json`).then((response) => response.json()),
      loadCurrentArcgisMetrics(),
      fetch(`${DATA_ROOT}/all_months.geojson`).then((response) => response.json()),
      fetchSurveyPeriodStats().catch(() => []),
      fetchAssignmentLayerMetadata(ASSIGNMENT_CURRENT_LAYER_URL, {
        layerName: ASSIGNMENT_CURRENT_LAYER_NAME,
        itemId: ASSIGNMENT_CURRENT_AGOL_ITEM_ID,
        itemUrl: ASSIGNMENT_CURRENT_AGOL_ITEM_URL
      }).catch(() => null),
      fetchAssignmentLayerMetadata(ASSIGNMENT_HISTORY_LAYER_URL, {
        layerName: ASSIGNMENT_HISTORY_LAYER_NAME,
        itemId: ASSIGNMENT_HISTORY_AGOL_ITEM_ID,
        itemUrl: ASSIGNMENT_HISTORY_AGOL_ITEM_URL
      }).catch(() => null),
      fetchAssignmentPeriodStats().catch(() => []),
      fetchAssignmentHistoryGeojson().then(
        (geojson) => ({ geojson }),
        (error) => ({ error })
      )
    ]);

  const surveyMetadata = await fetchSurveyLayerMetadata().catch(() => null);
  const withSurveySummary = enrichSummaryWithSurveyLayer(summary, surveyMetadata, surveyPeriodStats);
  const enrichedSummary = enrichSummaryWithAssignmentLayers(
    withSurveySummary,
    assignmentCurrentMetadata,
    assignmentHistoryMetadata,
    assignmentPeriodStats
  );
  const evidenceByPeriod = await loadSurveyEvidenceByPeriod(enrichedSummary.available_months).catch(() => ({}));
  const baseGeojson = assignmentHistoryResult.geojson || allMonthsGeojson;
  const mergedGeojson = mergeSurveyEvidenceIntoGeojson(baseGeojson, evidenceByPeriod);
  const liveMonthlyMetrics = assignmentHistoryResult.geojson
    ? aggregateLiveMonthlyMetrics(mergedGeojson, surveyPeriodStats)
    : null;
  const latestMonth = enrichedSummary.latest_month || liveMonthlyMetrics?.at(-1)?.period_month || monthlyMetrics.at(-1)?.period_month;
  const liveLatestSurveyRecordCount = Number(
    surveyPeriodStats.find((row) => row.period_label === latestMonth)?.record_count || 0
  );
  enrichedSummary.live_latest_survey_record_count = liveLatestSurveyRecordCount;
  enrichedSummary.assignment_source = assignmentHistoryResult.geojson
    ? ASSIGNMENT_HISTORY_LAYER_NAME
    : "published_assignment_geojson_fallback";
  const liveReturnedAssigned = countReturnedAssigned(mergedGeojson.features, latestMonth);
  const enrichedMonthlyMetrics = liveMonthlyMetrics || enrichLatestMonthlyMetrics(monthlyMetrics, latestMonth, liveReturnedAssigned);
  const liveContractorMonthly = assignmentHistoryResult.geojson
    ? aggregateLiveContractorMonthly(mergedGeojson)
    : null;

  return {
    monthlyMetrics: enrichedMonthlyMetrics,
    contractorMonthly: liveContractorMonthly || aggregateContractorMonthly(contractorMonthlyRaw),
    financeSummary,
    summary: enrichedSummary,
    currentMetrics
  };
}

async function main() {
  setupTabs();
  const { monthlyMetrics, contractorMonthly, financeSummary, summary, currentMetrics } = await loadData();
  let selectedMonth = summary.latest_month || monthlyMetrics.at(-1).period_month;

  const renderSelectedMonth = () => {
    const selectedContractorRows = contractorRowsForMonth(contractorMonthly, selectedMonth);
    const detailRows = buildContractorDetailRows(currentMetrics.contractorRows, selectedContractorRows);

    renderMonthOptions(monthlyMetrics, selectedMonth);
    renderSourceSummary(summary, currentMetrics, selectedMonth);
    appendFinanceSourceToSummary(financeSummary);
    renderKpis(monthlyMetrics, summary, currentMetrics, selectedMonth);
    renderLeadershipInsights(monthlyMetrics, selectedContractorRows, financeSummary, selectedMonth);
    renderContractorOptions(selectedContractorRows);
    renderContractorGroupedChart(selectedContractorRows, "all", selectedMonth);
    renderTimeline(monthlyMetrics, selectedMonth);
    renderParcelDetailsTable(detailRows);

    document.getElementById("contractorSelect").onchange = (event) => {
      renderContractorGroupedChart(selectedContractorRows, event.target.value, selectedMonth);
    };
  };

  renderSelectedMonth();
  renderSubmissionRateTable(monthlyMetrics);
  renderAreaDistribution(currentMetrics.contractorRows);
  renderFinance(financeSummary);

  document.getElementById("kpiMonthSelect").addEventListener("change", (event) => {
    selectedMonth = event.target.value;
    renderSelectedMonth();
  });
}

main().catch((error) => {
  console.error(error);
  document.getElementById("freshnessNote").textContent = "KPI dashboard failed to load source data.";
});
