import {
  SURVEY_LAYER_URL,
  SURVEY_AGOL_ITEM_URL,
  SURVEY_LAYER_NAME,
  dateFromMillis,
  fetchArcgisJson,
  fetchSurveyLayerMetadata,
  fetchSurveyPeriodStats,
  fetchSurveyRecordsForPeriod,
  enrichSummaryWithSurveyLayer,
  loadCombinedEvidenceByPeriodWithStats,
  mergeSurveyEvidenceIntoGeojson,
  parcelDigits
} from "./survey-layer.js?v=20260803-raw-completion-v2";
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
} from "./assignment-layer.js?v=20260803-raw-completion-v2";
import {
  financeFeedState,
  semanticQuarterSummary,
  semanticYearSummary
} from "./finance-semantic.js?v=20260804-powerbi-semantic-v1";
import { buildPowerBiAreaCompliance } from "./area-compliance.js?v=20260805-powerbi-area-v2";

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
const SERVICE_PERIOD_START_DAY = 15;
const EASTERN_TIME_ZONE = "America/New_York";
const CONTRACTOR_PALETTE = ["#4477AA", "#EE6677", "#228833", "#AA3377", "#66CCEE", "#EE7733", "#009988", "#332288", "#CCBB44", "#8C564B"];
const UNASSIGNED_CONTRACTOR_COLOR = "#6b7280";
const surveyRecordsCache = new globalThis.Map();
const easternDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function formatNumber(value) {
  return formatter.format(Number(value || 0));
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

async function fetchSurveyRecordsCached(periodLabel) {
  const period = String(periodLabel || "");
  if (!period) return [];
  if (!surveyRecordsCache.has(period)) {
    surveyRecordsCache.set(period, fetchSurveyRecordsForPeriod(period).catch((error) => {
      surveyRecordsCache.delete(period);
      throw error;
    }));
  }
  return surveyRecordsCache.get(period);
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

function formatSquareFeet(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Unavailable";
  return `${formatter.format(Math.round(Number(value)))} sq ft`;
}

function formatOptionalMoney(value) {
  return value === null || value === undefined || value === "" ? "Unavailable" : formatMoney(value);
}

function dateKeyFromParts(parts) {
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function easternDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateKeyFromParts(easternDateParts.formatToParts(date));
}

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function dateKeyForOffset(dateKey, offset) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function servicePeriodStartFor(date = new Date()) {
  const dateKey = easternDateKey(date);
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, SERVICE_PERIOD_START_DAY));
  if (day < SERVICE_PERIOD_START_DAY) start.setUTCMonth(start.getUTCMonth() - 1);
  return start.toISOString().slice(0, 10);
}

function servicePeriodLabel(startDateKey) {
  return String(startDateKey || "").slice(0, 7);
}

function shiftServicePeriodStart(startDateKey, months) {
  const start = dateFromKey(startDateKey);
  start.setUTCMonth(start.getUTCMonth() + months);
  return start.toISOString().slice(0, 10);
}

function shortDate(dateKey) {
  return dateFromKey(dateKey).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
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

function quarterKey(month) {
  const [year, rawMonth] = String(month).split("-");
  return `${year}-Q${Math.ceil(Number(rawMonth) / 3)}`;
}

function quarterLabelFromKey(key) {
  const match = String(key).match(/^(\d{4})-Q([1-4])$/);
  return match ? `Q${match[2]} ${match[1]}` : String(key || "Selected quarter");
}

function quarterBounds(key) {
  const match = String(key).match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  const year = Number(match[1]);
  const startMonth = (Number(match[2]) - 1) * 3;
  return {
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 0)),
    monthStarts: [0, 1, 2].map((offset) => new Date(Date.UTC(year, startMonth + offset, 1)))
  };
}

function isoDate(value) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function contractMonthsInQuarter(row, quarter) {
  if (!quarter) return 0;
  const start = isoDate(row.start_date);
  const end = isoDate(row.end_date);
  if (!start || !end || end < quarter.start || start > quarter.end) return 0;
  return quarter.monthStarts.filter((monthStart) => {
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
    return start <= monthEnd && end >= monthStart;
  }).length;
}

function buildQuarterFinance(financeSummary, selectedQuarterKey) {
  const quarter = quarterBounds(selectedQuarterKey);
  const rows = (financeSummary.current_contracts || [])
    .map((row) => ({ ...row, active_months_in_quarter: contractMonthsInQuarter(row, quarter) }))
    .filter((row) => row.active_months_in_quarter > 0)
    .map((row) => {
      const quarterlyForecast = Number(row.monthly_invoice_amount || 0) * row.active_months_in_quarter;
      return {
        ...row,
        quarterly_forecast: quarterlyForecast
      };
    });
  const parcels = rows.reduce((sum, row) => sum + Number(row.parcels || 0), 0);
  const monthlyInvoice = rows.reduce((sum, row) => sum + Number(row.monthly_invoice_amount || 0), 0);
  const quarterlyForecast = rows.reduce((sum, row) => sum + Number(row.quarterly_forecast || 0), 0);
  return {
    label: quarterLabelFromKey(selectedQuarterKey),
    rows,
    parcels,
    monthlyInvoice,
    quarterlyForecast,
    monthlyCostPerParcel: parcels ? monthlyInvoice / parcels : 0
  };
}

function buildYearFinance(financeSummary, selectedYear) {
  const year = Number(selectedYear);
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const now = new Date();
  const monthsThroughDate = year < now.getFullYear()
    ? 12
    : year > now.getFullYear()
      ? 0
      : now.getMonth() + 1;
  const rows = (financeSummary.current_contracts || []).map((row) => {
    const contractStart = isoDate(row.start_date);
    const contractEnd = isoDate(row.end_date);
    if (!contractStart || !contractEnd || contractStart > end || contractEnd < start) return null;
    let activeMonths = 0;
    let activeMonthsToDate = 0;
    for (let month = 0; month < 12; month += 1) {
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      if (contractStart <= monthEnd && contractEnd >= monthStart) {
        activeMonths += 1;
        if (month < monthsThroughDate) activeMonthsToDate += 1;
      }
    }
    return {
      ...row,
      annual_expected: Number(row.monthly_invoice_amount || 0) * activeMonths,
      expected_to_date: Number(row.monthly_invoice_amount || 0) * activeMonthsToDate,
    };
  }).filter(Boolean).filter((row) => row.annual_expected > 0);
  return {
    label: String(year),
    rows,
    annualExpected: rows.reduce((sum, row) => sum + row.annual_expected, 0),
    expectedToDate: rows.reduce((sum, row) => sum + row.expected_to_date, 0),
  };
}

function buildMonthFinance(financeSummary, selectedMonth) {
  const start = new Date(`${selectedMonth}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const rows = (financeSummary.current_contracts || []).filter((row) => {
    const contractStart = isoDate(row.start_date);
    const contractEnd = isoDate(row.end_date);
    return contractStart && contractEnd && contractStart <= end && contractEnd >= start;
  });
  return {
    label: shortMonth(selectedMonth),
    monthlyInvoice: rows.reduce((sum, row) => sum + Number(row.monthly_invoice_amount || 0), 0),
    organizationCount: rows.length
  };
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

function aggregateLiveMonthlyMetrics(geojson, surveyPeriodStats, surveyRecordStatsByPeriod = {}) {
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
      const uniqueReturned = row.returnedKeys.size;
      const returned = Number.isFinite(Number(surveyRecordStatsByPeriod[row.period_month]?.matched_count))
        ? Number(surveyRecordStatsByPeriod[row.period_month].matched_count)
        : uniqueReturned;
      const rawSurveys = Number(
        (surveyPeriodStats || []).find((stat) => stat.period_label === row.period_month)?.record_count || returned
      );
      return {
        period_month: row.period_month,
        assigned_active: assignedActive,
        assigned_total: assignedTotal,
        returned_assigned: returned,
        returned_unique_assigned: uniqueReturned,
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

function aggregateLiveContractorMonthly(geojson, surveyRecordStatsByPeriod = {}) {
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
    const rawReturned = surveyRecordStatsByPeriod[row.period_month]?.matched_by_contractor?.[row.organization];
    const returned = Number.isFinite(Number(rawReturned)) ? Number(rawReturned) : row.returnedKeys.size;
    return {
      period_month: row.period_month,
      organization: row.organization,
      assigned,
      returned,
      completionRate: assigned ? (100 * returned) / assigned : 0
    };
  });
}

function assignmentKeysForPeriod(geojson, periodLabel, activeOnly = false) {
  const keys = new Set();
  for (const feature of geojson?.features || []) {
    const props = feature.properties || {};
    if (props.period_month !== periodLabel || (activeOnly && props.maintenance_level !== "Active")) continue;
    const key = parcelDigits(props.parcel_key);
    if (key) keys.add(key);
  }
  return keys;
}

function activeAssignmentKeysForPeriod(geojson, periodLabel) {
  return assignmentKeysForPeriod(geojson, periodLabel, true);
}

function assignmentKeysByContractor(geojson, periodLabel, activeOnly = false) {
  const assignments = new Map();
  for (const feature of geojson?.features || []) {
    const props = feature.properties || {};
    if (props.period_month !== periodLabel || (activeOnly && props.maintenance_level !== "Active")) continue;
    const parcelKey = parcelDigits(props.parcel_key);
    if (!parcelKey) continue;
    const contractor = normalizeContractorName(props.organization);
    const keys = assignments.get(contractor) || new Set();
    keys.add(parcelKey);
    assignments.set(contractor, keys);
  }
  return assignments;
}

function activeAssignmentKeysByContractor(geojson, periodLabel) {
  return assignmentKeysByContractor(geojson, periodLabel, true);
}

function contractorColor(geojson, contractor) {
  if (contractor === "Unassigned") return UNASSIGNED_CONTRACTOR_COLOR;
  const names = [...new Set(
    (geojson?.features || [])
      .map((feature) => normalizeContractorName(feature.properties?.organization))
      .filter((name) => name && name !== "Unassigned")
  )].sort((a, b) => a.localeCompare(b));
  const index = Math.max(0, names.indexOf(contractor));
  return CONTRACTOR_PALETTE[index % CONTRACTOR_PALETTE.length];
}

function contractorReturnedCountsByDate(records, assignmentsByContractor, startDateKey, endDateKey) {
  const parcelContractors = new Map();
  for (const [contractor, parcelKeys] of assignmentsByContractor) {
    for (const parcelKey of parcelKeys) parcelContractors.set(parcelKey, contractor);
  }
  const returnedByContractor = new Map();
  for (const record of records || []) {
    const parcelKey = parcelDigits(record.parcelnumb);
    const submittedDate = easternDateKey(record.created_at);
    const contractor = parcelContractors.get(parcelKey);
    if (!contractor || !submittedDate || submittedDate < startDateKey || submittedDate > endDateKey) continue;
    const byDate = returnedByContractor.get(contractor) || new Map();
    byDate.set(submittedDate, (byDate.get(submittedDate) || 0) + 1);
    returnedByContractor.set(contractor, byDate);
  }
  return returnedByContractor;
}

function buildContractorDailyCompletionSeries(geojson, records, startDateKey, endDateKey) {
  const periodLabel = servicePeriodLabel(startDateKey);
  const activeAssignmentsByContractor = activeAssignmentKeysByContractor(geojson, periodLabel);
  const surveyAssignmentsByContractor = assignmentKeysByContractor(geojson, periodLabel);
  const returnedByContractor = contractorReturnedCountsByDate(records, surveyAssignmentsByContractor, startDateKey, endDateKey);
  const totalDays = Math.max(Math.floor((dateFromKey(endDateKey) - dateFromKey(startDateKey)) / 86400000), 0);
  return [...activeAssignmentsByContractor.entries()]
    .map(([contractor, assignmentKeys]) => {
      let returned = 0;
      const byDate = returnedByContractor.get(contractor) || new Map();
      const days = [];
      for (let offset = 0; offset <= totalDays; offset += 1) {
        const date = dateKeyForOffset(startDateKey, offset);
        returned += byDate.get(date) || 0;
        days.push({
          date,
          completionRate: assignmentKeys.size ? (100 * returned) / assignmentKeys.size : 0,
          returned
        });
      }
      return {
        contractor,
        label: shortContractor(contractor),
        color: contractorColor(geojson, contractor),
        assigned: assignmentKeys.size,
        days
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function returnedCountsByDate(records, assignmentKeys, startDateKey, endDateKey) {
  const recordsByDate = new Map();
  for (const record of records || []) {
    const parcelKey = parcelDigits(record.parcelnumb);
    const submittedDate = easternDateKey(record.created_at);
    if (!parcelKey || !assignmentKeys.has(parcelKey) || !submittedDate) continue;
    if (submittedDate < startDateKey || submittedDate > endDateKey) continue;
    recordsByDate.set(submittedDate, (recordsByDate.get(submittedDate) || 0) + 1);
  }
  return recordsByDate;
}

function buildMtdCompletionComparison(geojson, currentRecords, previousRecords, selectedPeriod, now = new Date()) {
  const currentStart = `${selectedPeriod}-15`;
  const axisEnd = shiftServicePeriodStart(currentStart, 1);
  const previousStart = shiftServicePeriodStart(currentStart, -1);
  const today = easternDateKey(now);
  const activePeriod = servicePeriodLabel(servicePeriodStartFor(now));
  const currentEnd = selectedPeriod === activePeriod && today < axisEnd ? today : axisEnd;
  const elapsedDays = Math.max(Math.floor((dateFromKey(currentEnd) - dateFromKey(currentStart)) / 86400000), 0);
  const previousEnd = dateKeyForOffset(previousStart, elapsedDays);
  const currentAssignmentKeys = activeAssignmentKeysForPeriod(geojson, servicePeriodLabel(currentStart));
  const previousAssignmentKeys = activeAssignmentKeysForPeriod(geojson, servicePeriodLabel(previousStart));
  const currentSurveyAssignmentKeys = assignmentKeysForPeriod(geojson, servicePeriodLabel(currentStart));
  const previousSurveyAssignmentKeys = assignmentKeysForPeriod(geojson, servicePeriodLabel(previousStart));
  const currentByDate = returnedCountsByDate(currentRecords, currentSurveyAssignmentKeys, currentStart, currentEnd);
  const previousByDate = returnedCountsByDate(previousRecords, previousSurveyAssignmentKeys, previousStart, currentStart);
  const contractorSeries = buildContractorDailyCompletionSeries(geojson, currentRecords, currentStart, currentEnd);
  let currentReturned = 0;
  let previousReturned = 0;
  const axisSpanDays = Math.max(Math.floor((dateFromKey(axisEnd) - dateFromKey(currentStart)) / 86400000), 0);
  const previousDays = [];
  const days = [];

  for (let offset = 0; offset <= axisSpanDays; offset += 1) {
    const previousDate = dateKeyForOffset(previousStart, offset);
    previousReturned += previousByDate.get(previousDate) || 0;
    previousDays.push({
      serviceDay: offset + 1,
      axisDate: dateKeyForOffset(currentStart, offset),
      previousDate,
      previousReturned,
      previousRate: previousAssignmentKeys.size ? (100 * previousReturned) / previousAssignmentKeys.size : 0
    });
  }

  for (let offset = 0; offset <= elapsedDays; offset += 1) {
    const currentDate = dateKeyForOffset(currentStart, offset);
    const previousDay = previousDays[offset];
    currentReturned += currentByDate.get(currentDate) || 0;
    days.push({
      serviceDay: offset + 1,
      currentDate,
      previousDate: previousDay.previousDate,
      currentReturned,
      previousReturned: previousDay.previousReturned,
      currentRate: currentAssignmentKeys.size ? (100 * currentReturned) / currentAssignmentKeys.size : 0,
      previousRate: previousDay.previousRate
    });
  }

  return {
    currentStart,
    currentEnd,
    axisEnd,
    previousStart,
    previousEnd,
    currentAssigned: currentAssignmentKeys.size,
    previousAssigned: previousAssignmentKeys.size,
    days,
    previousDays,
    contractorSeries
  };
}

async function loadMtdCompletionComparison(geojson, selectedPeriod) {
  const currentStart = `${selectedPeriod}-15`;
  const previousStart = shiftServicePeriodStart(currentStart, -1);
  const [currentRecords, previousRecords] = await Promise.all([
    fetchSurveyRecordsCached(servicePeriodLabel(currentStart)),
    fetchSurveyRecordsCached(servicePeriodLabel(previousStart))
  ]);
  return buildMtdCompletionComparison(geojson, currentRecords, previousRecords, selectedPeriod);
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
    shortMonth(latestMonth);
  document.getElementById("reportUpdatedKpi").textContent =
    `${summary.generated_on || currentMetrics.eppEdited || "today"} · surveys ${surveyEdited || "live"}`;
  document.getElementById("liveUniverseNote").textContent =
    `Surveys: live ArcGIS all-period layer. Assignments: ${summary.assignment_source === "gisdb_gis_regrid_bundle_assignments_history" ? "live ArcGIS history snapshot" : "published fallback"}.`;
}

function appendFinanceSourceToSummary(financeSummary) {
  if (!financeSummary?.metadata) return;
}

function renderKpis(monthlyMetrics, summary, currentMetrics, selectedMonth, surveyRecordStatsByPeriod) {
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
  const surveyRecordsReadout = document.getElementById("surveyRecordsReadout");
  const surveyRecordStats = surveyRecordStatsByPeriod?.[latest.period_month];
  const hasSurveyStats = Boolean(surveyRecordStats);
  if (surveyRecordsReadout) {
    surveyRecordsReadout.hidden = !hasSurveyStats;
    surveyRecordsReadout.textContent = hasSurveyStats
      ? `${formatNumber(surveyRecordStats.matched_count)} complete survey records`
      : "";
  }
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
    <span class="chart-tooltip-count">${formatNumber(returned)} / ${formatNumber(assigned)} complete</span>
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

  const monthFinance = buildMonthFinance(financeSummary, selectedMonth);
  document.getElementById("budgetRunRateInsight").textContent =
    formatMoneyCompact(monthFinance.monthlyInvoice);
  const budgetCopy = document.getElementById("budgetRunRateCopy");
  budgetCopy.textContent =
    `${formatMoneyCompact(financeSummary?.summary?.monthly_invoice_total || 0)}/mo · ${formatNumber(financeSummary?.summary?.organization_count || 0)} contractors`;
  budgetCopy.textContent =
    `${monthFinance.label} · ${formatNumber(monthFinance.organizationCount)} active contractors`;
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

function renderAreaDistribution(rows, selectedMonth) {
  if (!rows.length) {
    document.getElementById("areaDistributionChart").innerHTML = '<p class="chart-empty-state">Power BI parcel-area values are not available for this month. Use the secure report above.</p>';
    const summary = document.getElementById("areaDistributionSummary");
    if (summary) summary.textContent = `${shortMonth(selectedMonth)} · awaiting Power BI aggregate export`;
    return;
  }
  const maxSquareFeet = Math.max(1, ...rows.map((row) => Number(row.assigned_sqft || 0)));
  document.getElementById("areaDistributionChart").innerHTML = rows.map((row) => `
    <div class="grouped-row single-bar-row">
      <div class="grouped-label">
        <strong>${escapeHtml(shortContractor(row.organization))}</strong>
        <span>${row.assigned_parcels === null ? "Power BI" : `${formatNumber(row.assigned_parcels)} parcels`} · ${escapeHtml(String(row.compliance_status || "baseline_unavailable").replaceAll("_", " "))}</span>
      </div>
      <div class="grouped-bars">
        <span class="grouped-bar assigned" style="width:${Math.max((100 * Number(row.assigned_sqft || 0)) / maxSquareFeet, 2)}%"></span>
      </div>
      <div class="grouped-values">
        <span>${formatSquareFeet(row.assigned_sqft)}</span>
      </div>
    </div>
  `).join("");
  const summary = document.getElementById("areaDistributionSummary");
  if (summary) summary.textContent = `${shortMonth(selectedMonth)} assignment square footage, ranked by organization`;
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
          <span>${formatNumber(row.parcels)} parcels / ${formatSquareFeet(row.sq_footage || Number(row.acres || 0) * 43560)}</span>
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

function renderFinance(financeSummary, selectedQuarter) {
  const quarterFinance = buildQuarterFinance(financeSummary, selectedQuarter);
  const rows = quarterFinance.rows;
  const squareFeet = rows.reduce((sum, row) => sum + Number(row.sq_footage || 0), 0);
  document.getElementById("quarterForecastPerSqFtKpi").textContent = formatMoney(squareFeet ? quarterFinance.quarterlyForecast / squareFeet : 0);
  document.getElementById("monthlyCostPerParcelKpi").textContent = formatMoney(quarterFinance.monthlyCostPerParcel);
  document.getElementById("contractAcresKpi").textContent = formatSquareFeet(squareFeet);
  document.getElementById("contractParcelsKpi").textContent = formatNumber(quarterFinance.parcels);
  document.getElementById("quarterlyForecastNote").textContent = `${quarterFinance.label} · monthly invoice × active contract months`;
  renderMoneyBarChart("expenseIntensityChart", rows, "quarterly_forecast");
  renderMaintenanceExpenseTable(rows);
  const note = `Finance workbook · refreshed ${financeSummary.metadata?.generated_on || "unknown"}`;
  const scopedNote = `${note} · ${quarterFinance.label} contract forecast`;
  document.getElementById("financeSourceNote").textContent = scopedNote;
  document.getElementById("expenseSourceNote").textContent = scopedNote;
}

function aggregateLiveQuarterlyMetrics(geojson, monthlyMetrics) {
  const byQuarter = new Map();
  const featuresByQuarter = new Map();
  for (const metric of monthlyMetrics || []) {
    const quarter = quarterKey(metric.period_month);
    const row = byQuarter.get(quarter) || { quarter, months: [] };
    row.months.push({
      period_month: metric.period_month,
      active_assignments: Number(metric.assigned_active || 0),
      returned_assignments: Number(metric.returned_assigned || 0),
      open_assignments: Number(metric.open_active ?? Math.max(Number(metric.assigned_active || 0) - Number(metric.returned_assigned || 0), 0)),
      request_only_assignments: Number(metric.request_only || 0),
      assigned_parcels: Number(metric.assigned_total || 0),
      completion_rate_pct: Number(metric.active_completion_rate_pct || 0)
    });
    byQuarter.set(quarter, row);
  }
  for (const feature of geojson.features || []) {
    const props = feature.properties || {};
    if (!props.period_month || !props.parcel_key) continue;
    const quarter = quarterKey(props.period_month);
    const row = featuresByQuarter.get(quarter) || { parcels: new Set(), contractors: new Set(), ownersByMonth: new Map() };
    row.parcels.add(props.parcel_key);
    row.contractors.add(normalizeContractorName(props.organization));
    const owner = String(props.ownership_group || props.ownership_type || "").toUpperCase();
    const ownershipGroup = owner === "URA" || owner === "URA OWNED" ? "URA"
      : owner === "PLB" || owner === "PLB OWNED" || owner === "PITTSBURGH LAND BANK" ? "PLB" : null;
    if (ownershipGroup) {
      const monthOwners = row.ownersByMonth.get(props.period_month) || new Map();
      const ownerParcels = monthOwners.get(ownershipGroup) || new Set();
      ownerParcels.add(props.parcel_key);
      monthOwners.set(ownershipGroup, ownerParcels);
      row.ownersByMonth.set(props.period_month, monthOwners);
    }
    featuresByQuarter.set(quarter, row);
  }
  return {
    metadata: { source_status: "live_arcgis_assignment_history", baseline_source_status: "unavailable" },
    quarters: [...byQuarter.values()].sort((a, b) => a.quarter.localeCompare(b.quarter)).map((row) => {
      const months = row.months.sort((a, b) => a.period_month.localeCompare(b.period_month));
      const active = months.reduce((sum, month) => sum + month.active_assignments, 0);
      const returned = months.reduce((sum, month) => sum + month.returned_assignments, 0);
      const requestOnly = months.reduce((sum, month) => sum + month.request_only_assignments, 0);
      const featureSummary = featuresByQuarter.get(row.quarter) || { parcels: new Set(), contractors: new Set(), ownersByMonth: new Map() };
      const throughMonth = months.at(-1)?.period_month || null;
      const ownerBreakdown = [...(featureSummary.ownersByMonth.get(throughMonth) || new Map()).entries()]
        .map(([ownership_group, parcels]) => ({ ownership_group, parcels: parcels.size, sq_footage: null }))
        .sort((a, b) => a.ownership_group.localeCompare(b.ownership_group));
      return {
        quarter: row.quarter,
        through_month: throughMonth,
        is_complete: months.length === 3,
        active_assignments: active,
        returned_assignments: returned,
        open_assignments: Math.max(active - returned, 0),
        request_only_assignments: requestOnly,
        distinct_parcels: featureSummary.parcels.size,
        contractors: featureSummary.contractors.size,
        completion_rate_pct: active ? Math.round((1000 * returned) / active) / 10 : 0,
        months,
        owner_breakdown: ownerBreakdown,
        owner_responsibility_status: "unavailable"
      };
    })
  };
}

function renderBudget(financeSummary, selectedYear) {
  const yearFinance = buildYearFinance(financeSummary, selectedYear);
  const feed = financeFeedState(financeSummary);
  const semanticYear = semanticYearSummary(financeSummary, selectedYear);
  const actualToDate = feed.available
    ? semanticYear?.total_amount_spent ?? (financeSummary.actual_invoices || [])
      .filter((invoice) => String(invoice.period_month || invoice.posting_date || invoice.invoice_date || "").startsWith(String(selectedYear)))
      .reduce((sum, invoice) => sum + Number(invoice.actual_amount || invoice.amount || 0), 0)
    : null;
  const annualLimit = semanticYear?.yearly_limit ?? yearFinance.annualExpected;
  document.getElementById("annualRunRateKpi").textContent = formatMoney(annualLimit);
  document.getElementById("monthlyInvoiceKpi").textContent = formatMoney(yearFinance.expectedToDate);
  document.getElementById("totalContractKpi").textContent = formatOptionalMoney(actualToDate);
  document.getElementById("financeContractorsKpi").textContent = actualToDate === null
    ? "Unavailable"
    : formatMoney(annualLimit - actualToDate);
  document.getElementById("quarterlyForecastNote").textContent = feed.available
    ? `${selectedYear} Landcare limit · ${semanticYear?.percentage_spent?.toFixed(2) || "0.00"}% spent${feed.stale ? " · stale" : ""}`
    : `${selectedYear} contract expectation; finance actuals unavailable`;
  renderMoneyBarChart("budgetContractChart", yearFinance.rows, "annual_expected");
}

function dayOfMonth(dateKey) {
  return String(dateFromKey(dateKey).getUTCDate());
}

function renderInvoices(financeSummary, selectedQuarter) {
  const quarterFinance = buildQuarterFinance(financeSummary, selectedQuarter);
  const feed = financeFeedState(financeSummary);
  const actualStatus = feed.available ? "available" : "unavailable";
  const semanticQuarter = semanticQuarterSummary(financeSummary, selectedQuarter);
  const actualByOrganization = new Map();
  const quarterActuals = (financeSummary.actual_invoices || []).filter((invoice) => {
    const month = String(invoice.period_month || invoice.posting_date || invoice.invoice_date || "").slice(0, 7);
    const monthNumber = Number(month.slice(5, 7));
    const quarter = month.length === 7 && monthNumber >= 1 && monthNumber <= 12
      ? `${month.slice(0, 4)}-Q${Math.ceil(monthNumber / 3)}`
      : "";
    return quarter === selectedQuarter;
  });
  for (const invoice of quarterActuals) {
    const key = normalizeContractorName(invoice.organization || invoice.vendor);
    actualByOrganization.set(key, (actualByOrganization.get(key) || 0) + Number(invoice.actual_amount || invoice.amount || 0));
  }
  const rows = quarterFinance.rows.map((row) => {
    const actual = actualStatus === "available" ? actualByOrganization.get(normalizeContractorName(row.organization)) ?? 0 : null;
    return {
      invoice_id: actualStatus === "available" ? "Landcare check request(s)" : "Expected invoice forecast",
      organization: row.organization,
      service_period: quarterFinance.label,
      invoice_date: actualStatus === "available" ? "Selected quarter" : "—",
      expected_amount: row.quarterly_forecast,
      actual_amount: actual,
      variance: actual === null ? null : actual - Number(row.quarterly_forecast || 0),
      status: actualStatus === "available" ? "Recorded" : "Expected · actual unavailable",
      reference: actualStatus === "available" ? feed.sourceLabel : "Contract schedule"
    };
  });
  renderTable(document.getElementById("invoiceTable"), [
    { label: "Record", value: (row) => row.invoice_id },
    { label: "Contractor", value: (row) => shortContractor(row.organization) },
    { label: "Service period", value: (row) => row.service_period },
    { label: "Request / posting period", value: (row) => row.invoice_date },
    { label: "Expected", value: (row) => formatMoney(row.expected_amount) },
    { label: "Actual", value: (row) => formatOptionalMoney(row.actual_amount) },
    { label: "Variance", value: (row) => formatOptionalMoney(row.variance) },
    { label: "Status", value: (row) => row.status },
    { label: "Source", value: (row) => row.reference }
  ], rows);
  document.getElementById("invoiceSummary").textContent = actualStatus === "available"
    ? `${rows.length} contractor comparison(s) in ${quarterFinance.label} · ${formatMoney(semanticQuarter?.amount_spent || 0)} total`
    : `${rows.length} expected contractor invoice forecast(s) in ${quarterFinance.label}; finance actuals are unavailable.`;
  document.getElementById("financeSourceNote").textContent = actualStatus === "available"
    ? `${feed.sourceLabel} · refreshed ${feed.refreshedAt || "unknown"} · ${quarterFinance.label}${feed.stale ? " · showing last successful data" : ""}`
    : `Finance actuals unavailable · ${quarterFinance.label}`;
}

function renderQuarterlyReporting(quarterlyMetrics, financeSummary, selectedQuarter) {
  const quarter = (quarterlyMetrics?.quarters || []).find((row) => row.quarter === selectedQuarter);
  if (!quarter) return;
  document.getElementById("quarterActiveKpi").textContent = formatNumber(quarter.active_assignments);
  document.getElementById("quarterReturnedKpi").textContent = formatNumber(quarter.returned_assignments);
  document.getElementById("quarterOpenKpi").textContent = formatNumber(quarter.open_assignments);
  document.getElementById("quarterParcelsKpi").textContent = formatNumber(quarter.distinct_parcels);
  document.getElementById("quarterThroughNote").textContent = `${quarterLabelFromKey(selectedQuarter)}${quarter.is_complete ? " complete" : ` through ${shortMonth(quarter.through_month)}`}`;
  document.getElementById("quarterCompletionNote").textContent = `${formatPct(quarter.completion_rate_pct)} active completion`;
  document.getElementById("quarterContractorsNote").textContent = `${formatNumber(quarter.contractors)} contractors`;
  renderTable(document.getElementById("quarterMonthlyTable"), [
    { label: "Month", value: (row) => shortMonth(row.period_month) },
    { label: "Active", value: (row) => formatNumber(row.active_assignments) },
    { label: "Returned", value: (row) => formatNumber(row.returned_assignments) },
    { label: "Open", value: (row) => formatNumber(row.open_assignments) },
    { label: "Request only", value: (row) => formatNumber(row.request_only_assignments) },
    { label: "Completion", value: (row) => formatPct(row.completion_rate_pct) }
  ], quarter.months || []);
  const totalOwnerParcels = (quarter.owner_breakdown || []).reduce((sum, row) => sum + Number(row.parcels || 0), 0);
  const ownershipRows = (quarter.owner_breakdown || []).map((row) => ({
    ...row,
    share_pct: totalOwnerParcels ? (100 * Number(row.parcels || 0)) / totalOwnerParcels : 0
  }));
  renderTable(document.getElementById("quarterOwnershipTable"), [
    { label: "Owner", value: (row) => row.ownership_group },
    { label: "Parcels", value: (row) => formatNumber(row.parcels) },
    { label: "Parcel share", value: (row) => formatPct(row.share_pct) }
  ], ownershipRows);
  document.getElementById("quarterOwnershipNote").textContent = `${quarterLabelFromKey(selectedQuarter)} ownership distribution from assignment parcels`;
}

function renderAreaCompliance(areaCompliance, selectedMonth) {
  const rows = (areaCompliance?.rows || []).filter((row) => row.period_month === selectedMonth);
  renderAreaDistribution(rows, selectedMonth);
  const table = document.getElementById("areaComplianceTable");
  renderTable(table, [
    { label: "Contractor", value: (row) => shortContractor(row.organization) },
    { label: "Assigned square feet", value: (row) => formatSquareFeet(row.assigned_sqft) },
    { label: "Baseline", value: (row) => formatSquareFeet(row.baseline_sqft) },
    { label: "Allowed range", value: (row) => row.lower_limit_sqft === null ? "Unavailable" : `${formatSquareFeet(row.lower_limit_sqft)} – ${formatSquareFeet(row.upper_limit_sqft)}` },
    { label: "Variance", value: (row) => row.variance_pct === null ? "Unavailable" : formatPct(row.variance_pct) },
    { label: "Status", value: (row) => String(row.compliance_status || "baseline_unavailable").replaceAll("_", " ") }
  ], rows);
  if (!rows.length) {
    table.querySelector("tbody").innerHTML = '<tr><td colspan="6">Power BI parcel-area aggregates are not available for the selected month.</td></tr>';
  }
  const note = document.getElementById("areaComplianceSourceNote");
  if (areaCompliance?.metadata?.source_status === "available") {
    const freshness = areaCompliance.metadata.dataset_refreshed_at ? ` Refreshed ${areaCompliance.metadata.dataset_refreshed_at}.` : "";
    const stale = areaCompliance.metadata.feed_status === "stale" ? " Retained last successful extract." : "";
    note.textContent = `Source: Power BI Parcel Area Distribution semantic model.${freshness}${stale}`;
  } else {
    note.textContent = "Native table withheld because a Power BI parcel-area aggregate has not been published. Use the secure Power BI report above.";
  }
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
                aria-label="${escapeHtml(shortMonth(row.period_month))}: ${formatPct(rate)}, ${formatNumber(returned)} of ${formatNumber(assigned)} complete"
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

function bindDailyChartTooltips(container, selector, contentForMarker) {
  const shell = container.querySelector(".line-chart-shell");
  const tooltip = container.querySelector(".chart-floating-tooltip");
  if (!shell || !tooltip) return;
  const show = (marker) => {
    tooltip.innerHTML = contentForMarker(marker);
    tooltip.removeAttribute("hidden");
    tooltip.classList.add("is-visible");
    const shellRect = shell.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    tooltip.style.left = `${markerRect.left - shellRect.left + markerRect.width / 2}px`;
    tooltip.style.top = `${markerRect.top - shellRect.top}px`;
    marker.classList.add("is-active");
  };
  const hide = (marker) => {
    tooltip.setAttribute("hidden", "");
    tooltip.classList.remove("is-visible");
    marker.classList.remove("is-active");
  };
  for (const marker of container.querySelectorAll(selector)) {
    marker.addEventListener("mouseenter", () => show(marker));
    marker.addEventListener("focus", () => show(marker));
    marker.addEventListener("mouseleave", () => hide(marker));
    marker.addEventListener("blur", () => hide(marker));
  }
}

function bindDailyPathTooltips(container, selector, contentForPath) {
  const shell = container.querySelector(".line-chart-shell");
  const tooltip = container.querySelector(".chart-floating-tooltip");
  if (!shell || !tooltip) return;
  const show = (path, event = null) => {
    tooltip.innerHTML = contentForPath(path, event);
    tooltip.removeAttribute("hidden");
    tooltip.classList.add("is-visible");
    const shellRect = shell.getBoundingClientRect();
    const pathRect = path.getBoundingClientRect();
    const clientX = Number.isFinite(event?.clientX) ? event.clientX : pathRect.right;
    const clientY = Number.isFinite(event?.clientY) ? event.clientY : pathRect.top + pathRect.height / 2;
    tooltip.style.left = `${clientX - shellRect.left}px`;
    tooltip.style.top = `${clientY - shellRect.top}px`;
  };
  const hide = () => {
    tooltip.setAttribute("hidden", "");
    tooltip.classList.remove("is-visible");
  };
  for (const path of container.querySelectorAll(selector)) {
    path.addEventListener("mouseenter", (event) => show(path, event));
    path.addEventListener("mousemove", (event) => show(path, event));
    path.addEventListener("focus", () => show(path));
    path.addEventListener("mouseleave", hide);
    path.addEventListener("blur", hide);
  }
}

function serviceDayIndexFromPointer(event, svg, marginLeft, plotWidth, axisSpanDays, maxItemIndex) {
  if (!event || !svg) return maxItemIndex;
  const svgRect = svg.getBoundingClientRect();
  const viewX = ((event.clientX - svgRect.left) / Math.max(svgRect.width, 1)) * 720;
  return Math.max(0, Math.min(maxItemIndex, Math.round(((viewX - marginLeft) / plotWidth) * axisSpanDays)));
}

function renderMtdCompletionComparison(comparison) {
  const container = document.getElementById("mtdCompletionComparisonChart");
  const summary = document.getElementById("mtdCompletionSummary");
  if (!container || !summary) return;
  const latest = comparison?.days?.at(-1);
  if (!latest || !comparison.currentAssigned || !comparison.previousAssigned) {
    summary.textContent = "Daily completion pace is unavailable until active assignments are published for both service periods.";
    container.innerHTML = '<p class="chart-empty-state">No comparable active-assignment periods are available yet.</p>';
    return;
  }

  const delta = latest.currentRate - latest.previousRate;
  const deltaText = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`;
  summary.textContent = `${shortDate(comparison.currentStart)}–${shortDate(comparison.currentEnd)}: ${formatPct(latest.currentRate)} vs ${shortDate(comparison.previousStart)}–${shortDate(comparison.previousEnd)}: ${formatPct(latest.previousRate)} (${deltaText})`;

  const width = 720;
  const height = 270;
  const margin = { top: 20, right: 34, bottom: 46, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const days = comparison.days;
  const previousDays = comparison.previousDays || [];
  const axisSpanDays = Math.max(Math.floor((dateFromKey(comparison.axisEnd) - dateFromKey(comparison.currentStart)) / 86400000), 1);
  const toX = (dateKey) => margin.left + (Math.floor((dateFromKey(dateKey) - dateFromKey(comparison.currentStart)) / 86400000) / axisSpanDays) * plotWidth;
  const toY = (value) => margin.top + plotHeight - (Math.max(0, Math.min(100, Number(value || 0))) / 100) * plotHeight;
  const pathFor = (items, field, dateField) => items.map((day, index) => `${index ? "L" : "M"}${toX(day[dateField]).toFixed(1)},${toY(day[field]).toFixed(1)}`).join(" ");
  const xLabels = [];
  for (let offset = 0; offset <= axisSpanDays; offset += 5) xLabels.push(dateKeyForOffset(comparison.currentStart, offset));
  if (xLabels.at(-1) !== comparison.axisEnd) xLabels.push(comparison.axisEnd);

  container.innerHTML = `
    <div class="line-chart-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily cumulative completion rate for the selected service period compared to the previous service period">
        ${[0, 50, 100].map((tick) => {
          const y = toY(tick);
          return `<line class="chart-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="chart-tick" x="${margin.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${tick}%</text>`;
        }).join("")}
        <line class="chart-axis" x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}"></line>
        <line class="chart-axis" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}"></line>
        <path class="mtd-previous-line" d="${pathFor(previousDays, "previousRate", "axisDate")}"></path>
        <path class="mtd-current-line" d="${pathFor(days, "currentRate", "currentDate")}"></path>
        <path class="daily-line-hit" d="${pathFor(previousDays, "previousRate", "axisDate")}" data-series="previous" tabindex="0" role="button" aria-label="Hover for previous-period daily detail"></path>
        <path class="daily-line-hit" d="${pathFor(days, "currentRate", "currentDate")}" data-series="current" tabindex="0" role="button" aria-label="Hover for selected-period daily detail"></path>
        ${previousDays.map((day, index) => `<circle class="daily-hover-marker mtd-previous-hover" style="--series-color:#6b7785" cx="${toX(day.axisDate).toFixed(1)}" cy="${toY(day.previousRate).toFixed(1)}" r="8" data-series="previous" data-day-index="${index}" tabindex="0" role="button" aria-label="M-1 service day ${day.serviceDay}, ${shortDate(day.previousDate)}: ${formatPct(day.previousRate)}"></circle>`).join("")}
        ${days.map((day, index) => `<circle class="daily-hover-marker mtd-current-hover" style="--series-color:var(--ura-blue)" cx="${toX(day.currentDate).toFixed(1)}" cy="${toY(day.currentRate).toFixed(1)}" r="8" data-series="current" data-day-index="${index}" tabindex="0" role="button" aria-label="Service day ${day.serviceDay}, ${shortDate(day.currentDate)}: ${formatPct(day.currentRate)} selected period, ${formatPct(day.previousRate)} previous period"></circle>`).join("")}
        ${xLabels.map((dateKey) => `<text class="chart-count-label" x="${toX(dateKey).toFixed(1)}" y="${height - 17}" text-anchor="middle">${dayOfMonth(dateKey)}</text>`).join("")}
      </svg>
      <div class="chart-floating-tooltip" hidden></div>
    </div>
  `;
  bindDailyChartTooltips(container, ".daily-hover-marker", (marker) => {
    if (marker.dataset.series === "previous") {
      const day = previousDays[Number(marker.dataset.dayIndex)];
      return `
        <span class="chart-tooltip-month">M-1 · ${escapeHtml(shortDate(day.previousDate))} · service day ${day.serviceDay}</span>
        <strong class="chart-tooltip-rate">${formatPct(day.previousRate)}</strong>
    <span class="chart-tooltip-count">${formatNumber(day.previousReturned)} / ${formatNumber(comparison.previousAssigned)} complete</span>
      `;
    }
    const day = days[Number(marker.dataset.dayIndex)];
    return `
      <span class="chart-tooltip-month">${escapeHtml(shortDate(day.currentDate))} · service day ${day.serviceDay}</span>
      <strong class="chart-tooltip-rate">${formatPct(day.currentRate)}</strong>
      <span class="chart-tooltip-delta">M-1 ${escapeHtml(shortDate(day.previousDate))}: ${formatPct(day.previousRate)}</span>
    <span class="chart-tooltip-count">Selected: ${formatNumber(day.currentReturned)} / ${formatNumber(comparison.currentAssigned)} complete · M-1: ${formatNumber(day.previousReturned)} / ${formatNumber(comparison.previousAssigned)}</span>
    `;
  });
  bindDailyPathTooltips(container, ".daily-line-hit", (path, event) => {
    const svg = container.querySelector("svg");
    const isPrevious = path.dataset.series === "previous";
    const items = isPrevious ? previousDays : days;
    const index = serviceDayIndexFromPointer(event, svg, margin.left, plotWidth, axisSpanDays, items.length - 1);
    const day = items[index];
    if (isPrevious) {
      return `
        <span class="chart-tooltip-month">M-1 · ${escapeHtml(shortDate(day.previousDate))} · service day ${day.serviceDay}</span>
        <strong class="chart-tooltip-rate">${formatPct(day.previousRate)}</strong>
    <span class="chart-tooltip-count">${formatNumber(day.previousReturned)} / ${formatNumber(comparison.previousAssigned)} complete</span>
      `;
    }
    return `
      <span class="chart-tooltip-month">${escapeHtml(shortDate(day.currentDate))} · service day ${day.serviceDay}</span>
      <strong class="chart-tooltip-rate">${formatPct(day.currentRate)}</strong>
      <span class="chart-tooltip-delta">M-1: ${formatPct(day.previousRate)}</span>
    <span class="chart-tooltip-count">${formatNumber(day.currentReturned)} / ${formatNumber(comparison.currentAssigned)} complete</span>
    `;
  });
}

function renderContractorPaceChart(comparison) {
  const container = document.getElementById("contractorPaceChart");
  const summary = document.getElementById("contractorPaceSummary");
  const legend = document.getElementById("contractorPaceLegend");
  if (!container || !summary || !legend) return;
  const series = comparison?.contractorSeries || [];
  const days = series[0]?.days || [];
  if (!series.length || !days.length) {
    summary.textContent = "Daily contractor pace is unavailable until active assignments are published.";
    legend.innerHTML = "";
    container.innerHTML = '<p class="chart-empty-state">No active contractor assignments are available for this service period.</p>';
    return;
  }

  summary.textContent = `${shortDate(comparison.currentStart)}–${shortDate(comparison.currentEnd)} · ${series.length} contractor${series.length === 1 ? "" : "s"} · daily cumulative completion`;
  legend.innerHTML = series.map((item) => `
    <span><i class="contractor-pace-swatch" style="background:${item.color}"></i>${escapeHtml(item.label)}</span>
  `).join("");

  const width = 720;
  const height = 270;
  const margin = { top: 20, right: 30, bottom: 46, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const axisSpanDays = Math.max(Math.floor((dateFromKey(comparison.axisEnd) - dateFromKey(comparison.currentStart)) / 86400000), 1);
  const toX = (dateKey) => margin.left + (Math.floor((dateFromKey(dateKey) - dateFromKey(comparison.currentStart)) / 86400000) / axisSpanDays) * plotWidth;
  const toY = (value) => margin.top + plotHeight - (Math.max(0, Math.min(100, Number(value || 0))) / 100) * plotHeight;
  const pathFor = (item) => item.days.map((day, index) => `${index ? "L" : "M"}${toX(day.date).toFixed(1)},${toY(day.completionRate).toFixed(1)}`).join(" ");
  const xLabels = [];
  for (let offset = 0; offset <= axisSpanDays; offset += 5) xLabels.push(dateKeyForOffset(comparison.currentStart, offset));
  if (xLabels.at(-1) !== comparison.axisEnd) xLabels.push(comparison.axisEnd);

  container.innerHTML = `
    <div class="line-chart-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily cumulative completion rate by contractor for the selected service period">
        ${[0, 50, 100].map((tick) => {
          const y = toY(tick);
          return `<line class="chart-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="chart-tick" x="${margin.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${tick}%</text>`;
        }).join("")}
        <line class="chart-axis" x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}"></line>
        <line class="chart-axis" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}"></line>
        ${series.map((item) => `<path class="contractor-pace-line" stroke="${item.color}" d="${pathFor(item)}"><title>${escapeHtml(item.label)}: ${formatPct(item.days.at(-1).completionRate)} (${formatNumber(item.days.at(-1).returned)} of ${formatNumber(item.assigned)} complete)</title></path>`).join("")}
        ${series.map((item, seriesIndex) => `<path class="daily-line-hit" d="${pathFor(item)}" data-series-index="${seriesIndex}" tabindex="0" role="button" aria-label="Hover for ${escapeHtml(item.label)} daily detail"></path>`).join("")}
        ${series.flatMap((item, seriesIndex) => item.days.map((day, dayIndex) => `<circle class="daily-hover-marker contractor-daily-marker" style="--series-color:${item.color}" cx="${toX(day.date).toFixed(1)}" cy="${toY(day.completionRate).toFixed(1)}" r="7" data-series-index="${seriesIndex}" data-day-index="${dayIndex}" tabindex="0" role="button" aria-label="${escapeHtml(item.label)}, ${shortDate(day.date)}: ${formatPct(day.completionRate)}, ${formatNumber(day.returned)} of ${formatNumber(item.assigned)} complete"></circle>`)).join("")}
        ${xLabels.map((dateKey) => `<text class="chart-count-label" x="${toX(dateKey).toFixed(1)}" y="${height - 17}" text-anchor="middle">${dayOfMonth(dateKey)}</text>`).join("")}
      </svg>
      <div class="chart-floating-tooltip" hidden></div>
    </div>
  `;
  bindDailyChartTooltips(container, ".contractor-daily-marker", (marker) => {
    const item = series[Number(marker.dataset.seriesIndex)];
    const day = item.days[Number(marker.dataset.dayIndex)];
    return `
      <span class="chart-tooltip-month">${escapeHtml(item.label)} · ${escapeHtml(shortDate(day.date))}</span>
      <strong class="chart-tooltip-rate">${formatPct(day.completionRate)}</strong>
      <span class="chart-tooltip-count">${formatNumber(day.returned)} / ${formatNumber(item.assigned)} complete</span>
    `;
  });
  bindDailyPathTooltips(container, ".daily-line-hit", (path, event) => {
    const item = series[Number(path.dataset.seriesIndex)];
    const svg = container.querySelector("svg");
    const index = serviceDayIndexFromPointer(event, svg, margin.left, plotWidth, axisSpanDays, item.days.length - 1);
    const day = item.days[index];
    return `
      <span class="chart-tooltip-month">${escapeHtml(item.label)} · ${escapeHtml(shortDate(day.date))}</span>
      <strong class="chart-tooltip-rate">${formatPct(day.completionRate)}</strong>
      <span class="chart-tooltip-count">${formatNumber(day.returned)} / ${formatNumber(item.assigned)} complete</span>
    `;
  });
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

function renderMaintenanceExpenseTable(rows) {
  renderTable(
    document.getElementById("maintenanceExpenseTable"),
    [
      { label: "Organization", value: (row) => shortContractor(row.organization) },
      { label: "Parcels", value: (row) => formatNumber(row.parcels) },
      { label: "Square feet", value: (row) => formatSquareFeet(row.sq_footage) },
      { label: "Expected monthly", value: (row) => formatMoney(row.monthly_invoice_amount) },
      { label: "Actual monthly", value: () => "Unavailable" },
      { label: "Expected quarter", value: (row) => formatMoney(row.quarterly_forecast) },
      { label: "Monthly / Parcel", value: (row) => formatMoney(row.monthly_cost_per_parcel) },
      { label: "Expected / Sq Ft", value: (row) => formatMoney(Number(row.monthly_invoice_amount || 0) / Math.max(Number(row.sq_footage || 0), 1)) }
    ],
    rows
  );
}

function setupTabs(onTabChange = null) {
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
      if (onTabChange) onTabChange(tab);
    });
  }
}

async function loadData() {
  const [monthlyMetrics, contractorMonthlyRaw, summary, financeSummary, quarterlyMetrics, currentMetrics, allMonthsGeojson, surveyPeriodStats, assignmentCurrentMetadata, assignmentHistoryMetadata, assignmentPeriodStats, assignmentHistoryResult] =
    await Promise.all([
      fetch(`${DATA_ROOT}/monthly_metrics.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/contractor_monthly.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/kpi_summary.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/finance_summary.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/quarterly_metrics.json`).then((response) => response.json()),
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
  const baseGeojson = assignmentHistoryResult.geojson || allMonthsGeojson;
  const combinedEvidence = await loadCombinedEvidenceByPeriodWithStats(
    enrichedSummary.available_months,
    baseGeojson.features
  ).catch(() => ({ evidenceByPeriod: {}, surveyRecordStatsByPeriod: {} }));
  const evidenceByPeriod = combinedEvidence.evidenceByPeriod;
  const surveyRecordStatsByPeriod = combinedEvidence.surveyRecordStatsByPeriod;
  const mergedGeojson = mergeSurveyEvidenceIntoGeojson(baseGeojson, evidenceByPeriod);
  const liveMonthlyMetrics = assignmentHistoryResult.geojson
    ? aggregateLiveMonthlyMetrics(mergedGeojson, surveyPeriodStats, surveyRecordStatsByPeriod)
    : null;
  const latestMonth = liveMonthlyMetrics?.at(-1)?.period_month || enrichedSummary.latest_month || monthlyMetrics.at(-1)?.period_month;
  const liveLatestSurveyRecordCount = Number(
    surveyPeriodStats.find((row) => row.period_label === latestMonth)?.record_count || 0
  );
  enrichedSummary.live_latest_survey_record_count = liveLatestSurveyRecordCount;
  enrichedSummary.assignment_source = assignmentHistoryResult.geojson
    ? ASSIGNMENT_HISTORY_LAYER_NAME
    : "published_assignment_geojson_fallback";
  const enrichedMonthlyMetrics = liveMonthlyMetrics || monthlyMetrics.map((row) => {
    const surveyRecordStats = surveyRecordStatsByPeriod[row.period_month];
    if (!surveyRecordStats) return row;
    const assignedActive = Number(row.assigned_active || 0);
    const assignedTotal = Number(row.assigned_total || 0);
    const returned = Number(surveyRecordStats.matched_count || 0);
    return {
      ...row,
      returned_assigned: returned,
      active_completion_rate_pct: assignedActive ? Math.round((1000 * returned) / assignedActive) / 10 : 0,
      blended_completion_rate_pct: assignedTotal ? Math.round((1000 * returned) / assignedTotal) / 10 : 0,
      survey_rows_raw: Number(surveyRecordStats.raw_count || 0),
      survey_only_records: Math.max(Number(surveyRecordStats.raw_count || 0) - returned, 0),
      survey_source: SURVEY_LAYER_NAME
    };
  });
  const liveContractorMonthly = assignmentHistoryResult.geojson
    ? aggregateLiveContractorMonthly(mergedGeojson, surveyRecordStatsByPeriod)
    : null;
  const liveQuarterlyMetrics = assignmentHistoryResult.geojson
    ? aggregateLiveQuarterlyMetrics(mergedGeojson, liveMonthlyMetrics)
    : null;
  const powerBiAreaCompliance = buildPowerBiAreaCompliance(financeSummary);

  return {
    monthlyMetrics: enrichedMonthlyMetrics,
    contractorMonthly: liveContractorMonthly || aggregateContractorMonthly(contractorMonthlyRaw),
    financeSummary,
    quarterlyMetrics: liveQuarterlyMetrics || quarterlyMetrics,
    areaCompliance: powerBiAreaCompliance,
    summary: enrichedSummary,
    currentMetrics,
    assignmentGeojson: mergedGeojson,
    surveyRecordStatsByPeriod
  };
}

async function main() {
  const {
    monthlyMetrics,
    contractorMonthly,
    financeSummary,
    quarterlyMetrics,
    areaCompliance,
    summary,
    currentMetrics,
    assignmentGeojson,
    surveyRecordStatsByPeriod
  } = await loadData();
  let selectedMonth = summary.latest_month || monthlyMetrics.at(-1).period_month;
  let selectedQuarter = quarterKey(selectedMonth);
  let comparisonRenderId = 0;
  const comparisonCache = new Map();

  const renderQuarterOptions = () => {
    const select = document.getElementById("kpiQuarterSelect");
    const quarters = (quarterlyMetrics?.quarters || []).map((row) => row.quarter);
    select.innerHTML = quarters.map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(quarterLabelFromKey(key))}</option>`).join("");
    select.value = quarters.includes(selectedQuarter) ? selectedQuarter : quarters.at(-1) || "";
    selectedQuarter = select.value || selectedQuarter;
  };

  const renderQuarterScoped = () => {
    renderQuarterlyReporting(quarterlyMetrics, financeSummary, selectedQuarter);
  };

  const setContextControls = (tab) => {
    const usesMonth = tab === "landing" || tab === "areaDistribution";
    const usesQuarter = tab === "quarterlyReporting";
    const isPowerBi = tab === "powerBiBudget";
    document.getElementById("reportContext").hidden = isPowerBi;
    document.getElementById("monthControl").hidden = !usesMonth;
    document.getElementById("quarterControl").hidden = !usesQuarter;
  };

  const loadPowerBiEmbed = (frameId) => {
    const frame = document.getElementById(frameId);
    if (frame && !frame.hasAttribute("src")) frame.src = frame.dataset.src;
  };

  const comparisonForMonth = (month) => {
    if (!comparisonCache.has(month)) {
      comparisonCache.set(month, loadMtdCompletionComparison(assignmentGeojson, month).catch(() => null));
    }
    return comparisonCache.get(month);
  };

  const renderSelectedMonth = async () => {
    const renderId = ++comparisonRenderId;
    const monthAtRender = selectedMonth;
    const selectedContractorRows = contractorRowsForMonth(contractorMonthly, selectedMonth);
    renderMonthOptions(monthlyMetrics, selectedMonth);
    renderQuarterOptions();
    renderSourceSummary(summary, currentMetrics, selectedMonth);
    appendFinanceSourceToSummary(financeSummary);
    renderKpis(monthlyMetrics, summary, currentMetrics, selectedMonth, surveyRecordStatsByPeriod);
    renderLeadershipInsights(monthlyMetrics, selectedContractorRows, financeSummary, selectedMonth);
    renderContractorOptions(selectedContractorRows);
    renderContractorGroupedChart(selectedContractorRows, "all", selectedMonth);
    renderTimeline(monthlyMetrics, selectedMonth);
    renderAreaCompliance(areaCompliance, selectedMonth);
    renderQuarterScoped();

    document.getElementById("contractorSelect").onchange = (event) => {
      renderContractorGroupedChart(selectedContractorRows, event.target.value, selectedMonth);
    };

    document.getElementById("mtdCompletionSummary").textContent = `Loading ${shortMonth(monthAtRender)} and M-1 daily pace...`;
    document.getElementById("contractorPaceSummary").textContent = `Loading ${shortMonth(monthAtRender)} contractor pace...`;
    document.getElementById("mtdCompletionComparisonChart").innerHTML = '<p class="chart-empty-state">Loading daily comparison...</p>';
    document.getElementById("contractorPaceChart").innerHTML = '<p class="chart-empty-state">Loading contractor detail...</p>';
    document.getElementById("contractorPaceLegend").innerHTML = "";
    const comparison = await comparisonForMonth(monthAtRender);
    if (renderId !== comparisonRenderId || monthAtRender !== selectedMonth) return;
    renderMtdCompletionComparison(comparison);
    renderContractorPaceChart(comparison);
  };

  await renderSelectedMonth();
  setupTabs((tab) => {
    setContextControls(tab);
    if (tab === "areaDistribution") loadPowerBiEmbed("powerBiParcelAreaFrame");
    if (tab === "powerBiBudget") loadPowerBiEmbed("powerBiBudgetFrame");
    renderQuarterScoped();
  });
  setContextControls("landing");

  document.getElementById("kpiMonthSelect").addEventListener("change", async (event) => {
    selectedMonth = event.target.value;
    selectedQuarter = quarterKey(selectedMonth);
    await renderSelectedMonth();
  });

  document.getElementById("kpiQuarterSelect").addEventListener("change", (event) => {
    selectedQuarter = event.target.value;
    renderQuarterScoped();
  });

  document.getElementById("exportQuarterCsvButton").addEventListener("click", () => {
    const quarter = (quarterlyMetrics?.quarters || []).find((row) => row.quarter === selectedQuarter);
    if (!quarter) return;
    const totalOwnerParcels = (quarter.owner_breakdown || []).reduce((sum, row) => sum + Number(row.parcels || 0), 0);
    const rows = [["Section", "Quarter", "Period / owner", "Active assignments", "Returned assignments", "Open assignments", "Request only", "Completion rate", "Parcels", "Parcel share"]]
      .concat((quarter.months || []).map((row) => ["Monthly assignment summary", selectedQuarter, row.period_month, row.active_assignments, row.returned_assignments, row.open_assignments, row.request_only_assignments, row.completion_rate_pct, row.assigned_parcels, ""]))
      .concat((quarter.owner_breakdown || []).map((row) => [
        "Ownership distribution",
        selectedQuarter,
        row.ownership_group,
        "",
        "",
        "",
        "",
        "",
        row.parcels,
        totalOwnerParcels ? (100 * Number(row.parcels || 0)) / totalOwnerParcels : 0
      ]));
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `landcare-quarterly-report-${selectedQuarter}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  document.getElementById("printQuarterButton").addEventListener("click", () => window.print());
}

main().catch((error) => {
  console.error(error);
  document.getElementById("freshnessNote").textContent = "KPI dashboard failed to load source data.";
});
