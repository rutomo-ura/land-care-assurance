import Map from "https://js.arcgis.com/4.30/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js";
import Basemap from "https://js.arcgis.com/4.30/@arcgis/core/Basemap.js";
import GeoJSONLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/GeoJSONLayer.js";
import FeatureLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/FeatureLayer.js";
import WebTileLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/WebTileLayer.js";
import Home from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Home.js";
import Search from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Search.js";
import BasemapToggle from "https://js.arcgis.com/4.30/@arcgis/core/widgets/BasemapToggle.js";
import Zoom from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Zoom.js";
import {
  SURVEY_LAYER_URL,
  SURVEY_AGOL_ITEM_URL,
  SURVEY_LAYER_NAME,
  dateFromMillis,
  fetchArcgisJson,
  fetchSurveyEvidenceForParcel,
  fetchSurveyLayerMetadata,
  fetchSurveyPeriodStats,
  fetchSurveyRecordsForPeriod,
  enrichSummaryWithSurveyLayer,
  loadCombinedEvidenceByPeriod,
  loadSurvey123EvidenceByPeriod,
  mergeAvailableMonths,
  mergeSurveyEvidenceIntoGeojson,
  survey123EvidenceMatchesAssignment
} from "./survey-layer.js?v=20260731-field-notes";
import {
  ASSIGNMENT_CURRENT_LAYER_NAME,
  ASSIGNMENT_CURRENT_LAYER_URL,
  ASSIGNMENT_CURRENT_AGOL_ITEM_ID,
  ASSIGNMENT_CURRENT_AGOL_ITEM_URL,
  ASSIGNMENT_HISTORY_LAYER_NAME,
  ASSIGNMENT_HISTORY_LAYER_URL,
  ASSIGNMENT_HISTORY_AGOL_ITEM_ID,
  ASSIGNMENT_HISTORY_AGOL_ITEM_URL,
  enrichSummaryWithAssignmentLayers,
  fetchAssignmentHistoryGeojson,
  fetchAssignmentLayerMetadata,
  fetchAssignmentPeriodStats
} from "./assignment-layer.js?v=20260729-submitted-metrics";

const DATA_ROOT = "../landcare/data";
const EPP_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_epp_parcels_full/FeatureServer/0";
const COUNCIL_DISTRICT_LAYER_URL =
  "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/CouncilDistricts2022/FeatureServer/0";
const CURRENT_WHERE = "tags LIKE '%LandCare%' AND inventory_type IN ('URA Owned', 'PLB Owned')";
const CARTO_LIGHT_ATTRIBUTION = "© OpenStreetMap contributors © CARTO";
const CURRENT_OUT_FIELDS = [
  "OBJECTID",
  "parcel_number",
  "par_pin",
  "par_mapblocklo",
  "property_id",
  "inventory_type",
  "current_status",
  "census_tract",
  "council_district",
  "neighborhood",
  "project_name",
  "property_class",
  "property_maint_mgr_name",
  "par_calcacreag",
  "zoned_as",
  "tags",
  "mod_dt",
  "parcel_sqft"
].join(",");

const statusColors = {
  current_active: "#2f80ed",
  returned: "#2e7d32",
  missing: "#d97706",
  request_only: "#6b7280",
  survey_only: "#7b1fa2",
  ownership_risk: "#c2410c"
};

const contractorPalette = ["#4477AA", "#EE6677", "#228833", "#AA3377", "#66CCEE", "#EE7733", "#009988", "#332288", "#CCBB44", "#8C564B"];
const UNASSIGNED_CONTRACTOR_COLOR = "#6b7280";

const state = {
  summary: null,
  geojson: null,
  datasets: null,
  finance: null,
  view: null,
  layers: {},
  boundaryLayers: {},
  contractorFilter: "all",
  // The assignment-bundle map starts with every assigned parcel. The separate
  // Current Portfolio view retains URA as its own initial ownership scope.
  ownershipFilter: "all",
  ownershipFilterByView: { history: "all", current: "URA" },
  districtFilter: "all",
  landcareStatusFilter: "all",
  colorMode: "status",
  selectedMonth: null,
  dataView: "history",
  mapFocusLabel: "",
  currentDataWarning: "",
  surveyLayerInfo: null,
  surveyPeriodStats: [],
  assignmentLayerInfo: null,
  assignmentPeriodStats: [],
  surveyLayerMode: "all",
  evidenceCache: new globalThis.Map(),
  survey123EvidenceByPeriod: {},
  surveyRecordsByPeriod: {}
};

const DEFAULT_EXPORT_METRICS = ["completionRate", "open", "returned", "active", "annualRunRate"];

const formatter = new Intl.NumberFormat("en-US");

function formatNumber(value) {
  return formatter.format(Number(value || 0));
}

function pct(numerator, denominator) {
  return denominator ? `${((100 * numerator) / denominator).toFixed(1)}%` : "0.0%";
}

function formatAcres(value) {
  return `${Number(value || 0).toFixed(2)} ac`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function slug(value) {
  return String(value || "all")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "all";
}

function parcelDigits(value) {
  // County PINs contain a meaningful block letter. Strip formatting only;
  // do not turn 0124K00195000000 into a different all-numeric parcel key.
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeBlockLot(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function ownershipGroup(value) {
  const text = String(value || "").trim();
  if (text === "URA" || text === "URA Owned") return "URA";
  if (text === "PLB" || text === "PLB Owned" || text === "Pittsburgh Land Bank") return "PLB";
  return "Other";
}

function ownershipLabel(value) {
  return { all: "URA + Pittsburgh Land Bank", URA: "URA-owned", PLB: "Pittsburgh Land Bank-owned", Other: "Other or unknown" }[value] || "Other or unknown";
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

function statusLabel(status) {
  return {
    current_active: "Active assignment",
    returned: "Survey complete",
    missing: "Open active assignment",
    request_only: "Request only",
    survey_only: "Survey-only record",
    ownership_risk: "Ownership issue"
  }[status] || status || "Unknown";
}

function shortContractor(name) {
  return String(name || "Unassigned")
    .replace("FHCV Contracting LLC & LawnCare", "FHCV Contracting")
    .replace("Ervin Home Beautification", "Ervin Home")
    .replace("Operation Better Block", "Op. Better Block")
    .replace("One Call Handles It All", "One Call");
}

function financeContractorName(name) {
  return String(name || "Unassigned").replace(/\s+Primary Contact$/i, "") || "Unassigned";
}

function contractorItems() {
  const counts = {};
  const returned = {};
  const active = {};
  const requestOnly = {};
  for (const feature of districtFilteredFeatures()) {
    const props = feature.properties || {};
    const org = props.organization || "Unassigned";
    const parcelKey = props.parcel_key;
    if (!parcelKey) continue;
    counts[org] ||= new Set();
    returned[org] ||= new Set();
    active[org] ||= new Set();
    requestOnly[org] ||= new Set();
    counts[org].add(parcelKey);
    if (props.returned_flag) returned[org].add(parcelKey);
    if (props.maintenance_level === "Active") active[org].add(parcelKey);
    if (props.maintenance_level === "Request Only") requestOnly[org].add(parcelKey);
  }
  const contractorNames = [...new Set(
    ["history", "current"].flatMap((key) => state.datasets?.[key]?.geojson?.features || [])
      .map((feature) => feature.properties?.organization)
      .filter((name) => name && name !== "Unassigned")
  )].sort((a, b) => a.localeCompare(b));
  return Object.entries(counts)
    .map(([name, keys]) => [name, keys.size])
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], index) => ({
      name,
      label: shortContractor(name),
      count,
      returned: returned[name]?.size || 0,
      active: active[name]?.size || 0,
      requestOnly: requestOnly[name]?.size || 0,
      color: name === "Unassigned"
        ? UNASSIGNED_CONTRACTOR_COLOR
        : contractorPalette[Math.max(0, contractorNames.indexOf(name)) % contractorPalette.length]
    }));
}

function contractorColor(name) {
  return contractorItems().find((item) => item.name === name)?.color || "#8a8f98";
}

function districtItems() {
  const counts = {};
  const features = currentMonthFeatures();
  for (const feature of features) {
    const district = String(feature.properties.council_district || "").trim();
    if (!district) continue;
    const parcelKey = feature.properties.parcel_key;
    counts[district] ||= new Set();
    if (parcelKey) counts[district].add(parcelKey);
  }
  return Object.entries(counts)
    .map(([district, parcels]) => ({ district, count: parcels.size }))
    .sort((a, b) => Number(a.district) - Number(b.district) || a.district.localeCompare(b.district));
}

function sqlValue(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function contractorContactClause(name) {
  if (!name || name === "all") return null;
  const contacts = [
    ...new Set(
      (state.datasets?.current?.geojson?.features || [])
        .filter((feature) => feature.properties.organization === name)
        .map((feature) => feature.properties.organization_contact)
        .filter(Boolean)
    )
  ];
  return contacts.length
    ? `(${contacts.map((contact) => `property_maint_mgr_name = ${sqlValue(contact)}`).join(" OR ")})`
    : null;
}


function stripPrimaryContact(value) {
  return String(value || "Unassigned").replace(/\s+Primary Contact$/i, "") || "Unassigned";
}

function isLiveCurrentDataset() {
  return state.datasets?.current?.summary?.view_source === "live_arcgis";
}

function currentMaintenanceLevel(tags) {
  const text = String(tags || "");
  if (text.includes("LandCare - Request Only")) return "Request Only";
  if (text.includes("LandCare - Active")) return "Active";
  return "LandCare";
}

function normalizeCurrentAttributes(attrs) {
  const parcelSqft = Number(attrs.parcel_sqft || 0);
  const acreage = Number(attrs.par_calcacreag || 0);
  const maintenanceLevel = currentMaintenanceLevel(attrs.tags);
  const parcelKey = attrs.parcel_number || attrs.property_id || `EPP-${attrs.OBJECTID}`;
  return {
    objectid: attrs.OBJECTID,
    parcel_key: parcelKey,
    parcel_digits: parcelDigits(parcelKey),
    parcel_number: attrs.parcel_number,
    block_lot: attrs.par_mapblocklo || "",
    property_id: attrs.property_id,
    period_month: "Current",
    organization: stripPrimaryContact(attrs.property_maint_mgr_name),
    organization_contact: attrs.property_maint_mgr_name || "Unassigned",
    maintenance_level: maintenanceLevel,
    completion_status: maintenanceLevel === "Request Only" ? "request_only" : "current_active",
    returned_flag: false,
    ownership_type: attrs.inventory_type,
    ownership_group: ownershipGroup(attrs.inventory_type),
    inventory_type: attrs.inventory_type,
    current_status: attrs.current_status,
    census_tract: attrs.census_tract,
    council_district: attrs.council_district,
    neighborhood: attrs.neighborhood,
    project_name: attrs.project_name,
    property_class: attrs.property_class,
    acreage,
    zoning: attrs.zoned_as,
    parcel_sqft: parcelSqft,
    area_source: acreage ? "ArcGIS par_calcacreag" : "ArcGIS parcel_sqft fallback",
    tags: attrs.tags,
    mod_dt: dateFromMillis(attrs.mod_dt),
    source_layer: "gisdb_gis_epp_parcels_full"
  };
}

function esriPolygonToGeoJson(geometry) {
  const rings = geometry?.rings;
  if (!Array.isArray(rings) || !rings.length) return null;
  return {
    type: "Polygon",
    coordinates: rings.map((ring) => ring.map((point) => [point[0], point[1]]))
  };
}

function currentMonthFeatures() {
  const features = state.geojson?.features || [];
  if (state.dataView === "current") return features;
  // Historical compliance must use the complete assignment bundle for the
  // selected service month. Restricting it to today's EPP inventory silently
  // removes parcels that have since left the current portfolio and makes Map
  // Monitor disagree with the KPI dashboard's monthly assignment denominator.
  return features.filter((feature) => feature.properties.period_month === state.selectedMonth);
}

function districtFilteredFeatures() {
  const features = currentMonthFeatures();
  return features.filter((feature) => {
    const group = ownershipGroup(feature.properties.ownership_group || feature.properties.ownership_type || feature.properties.inventory_type);
    if (state.ownershipFilter !== "all" && group !== state.ownershipFilter) return false;
    return state.districtFilter === "all" || String(feature.properties.council_district || "") === state.districtFilter;
  });
}

function filteredFeatures() {
  const features = districtFilteredFeatures();
  return features.filter((feature) => {
    if (state.contractorFilter !== "all" && feature.properties.organization !== state.contractorFilter) return false;
    if (
      state.dataView === "history" &&
      state.landcareStatusFilter !== "all" &&
      feature.properties.completion_status !== state.landcareStatusFilter
    ) {
      return false;
    }
    return true;
  });
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function evidenceDate(value) {
  if (value == null || value === "") return null;
  const date = typeof value === "number"
    ? new Date(value)
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativeEvidenceDate(value) {
  const date = evidenceDate(value);
  if (!date) return "";
  const startOfDay = (input) => new Date(input.getFullYear(), input.getMonth(), input.getDate());
  const dayDifference = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  if (dayDifference > 1) return `${dayDifference} days ago`;
  return dayDifference === -1 ? "Tomorrow" : `${Math.abs(dayDifference)} days from now`;
}

function evidenceContextMarkup(props) {
  const serviceDate = props.service_date || props.date_of_services || props.date_services;
  const dateValue = serviceDate || props.created_at || props.submitted_at;
  const date = evidenceDate(dateValue);
  const notes = String(props.additional_notes || props.additional_comments || props.additional_note || props.notes || "").trim();
  if (!date && !notes) return "";
  const dateLabel = serviceDate ? "Service date" : "Submitted";
  const dateText = date
    ? `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${relativeEvidenceDate(date)}`
    : "";
  return `<div class="survey-photo-context">
    ${dateText ? `<span>${escapeHtml(dateLabel)}: ${escapeHtml(dateText)}</span>` : ""}
    ${notes ? `<p>${escapeHtml(notes)}</p>` : ""}
  </div>`;
}

function surveyPhotoMarkup(props, { compact = false } = {}) {
  const imageUrl = safeImageUrl(props.image_url || props.image_original || props.photo_url);
  const context = compact ? "" : evidenceContextMarkup(props);
  if (!imageUrl) {
    return context ? `<section class="survey-photo-evidence survey-evidence-context-only">${context}</section>` : "";
  }
  const isApprovedSurvey123 = props.evidence_source === "approved_internal_survey123" ||
    props.survey_source === "Survey123 approved evidence";
  const sourceLabel = isApprovedSurvey123 ? "Approved Survey123 photo" : "Regrid survey photo";
  return `
    <section class="survey-photo-evidence${compact ? " compact" : ""}">
      <a href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open full ${escapeHtml(sourceLabel)}">
        <img data-evidence-photo src="${escapeHtml(imageUrl)}" alt="${escapeHtml(sourceLabel)} for parcel ${escapeHtml(props.parcelnumb || props.parcel_key || "")}" loading="lazy" referrerpolicy="no-referrer" />
      </a>
      ${context}
    </section>`;
}

function bindPhotoFallbacks(container) {
  for (const image of container.querySelectorAll("img[data-evidence-photo]:not([data-fallback-bound])")) {
    image.dataset.fallbackBound = "true";
    image.addEventListener("error", () => {
      image.closest(".survey-photo-evidence")?.classList.add("image-unavailable");
      image.remove();
    }, { once: true });
  }
}

function surveyPhotoGalleryMarkup(props) {
  const evidence = (Array.isArray(props.evidence_photos) ? props.evidence_photos : [])
    .map((record) => surveyPhotoMarkup(record))
    .filter(Boolean);
  if (!evidence.length) {
    return '<div class="survey-photo-empty">No returned photo available for this parcel and period.</div>';
  }
  return `
    <section class="survey-photo-gallery" aria-label="Returned survey photos">
      ${evidence.join("")}
    </section>`;
}

function evidenceCommentPaneMarkup(props) {
  const record = (props.evidence_photos || []).find((candidate) => (
    String(candidate.additional_notes || candidate.additional_comments || candidate.additional_note || candidate.notes || "").trim()
  ));
  if (!record) return "";
  const notes = String(record.additional_notes || record.additional_comments || record.additional_note || record.notes || "").trim();
  const serviceDate = record.service_date || record.date_of_services || record.date_services;
  const dateValue = serviceDate || record.created_at || record.submitted_at;
  const date = evidenceDate(dateValue);
  const dateLabel = serviceDate ? "Service date" : "Submitted";
  const dateText = date
    ? `${dateLabel}: ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "";
  return `
    <div class="evidence-comment-pane" aria-label="Field comment">
      <span class="evidence-comment-pane__label">Field comment</span>
      <p>${escapeHtml(notes)}</p>
      ${dateText ? `<span class="evidence-comment-pane__date">${escapeHtml(dateText)}</span>` : ""}
    </div>`;
}

function uniqueCount(features, predicate = () => true) {
  return new Set(
    features
      .filter(predicate)
      .map((feature) => feature.properties.parcel_key)
      .filter(Boolean)
  ).size;
}

function uniqueParcelRows(features) {
  const rows = new globalThis.Map();
  for (const feature of features) {
    const props = feature.properties || {};
    if (!props.parcel_key) continue;
    if (!rows.has(props.parcel_key)) rows.set(props.parcel_key, props);
  }
  return [...rows.values()];
}

function totalAcres(features) {
  return uniqueParcelRows(features).reduce((sum, props) => {
    const acres = Number(props.acreage || 0) || (Number(props.parcel_sqft || 0) ? Number(props.parcel_sqft) / 43560 : 0);
    return sum + acres;
  }, 0);
}

function fillSymbol(color, outline = "#ffffff") {
  return {
    type: "simple-fill",
    color: `${color}cc`,
    outline: { color: outline, width: 0.75 }
  };
}

function surveyRecordCountForSelectedPeriod() {
  return Number(
    (state.surveyPeriodStats || []).find((row) => row.period_label === state.selectedMonth)?.record_count || 0
  );
}

function assignmentRecordCountForSelectedPeriod() {
  return Number(
    (state.assignmentPeriodStats || []).find((row) => row.period_label === state.selectedMonth)?.record_count || 0
  );
}

function matchedReturnedCount(features = currentMonthFeatures()) {
  return uniqueCount(features, (feature) => feature.properties.returned_flag);
}

function selectedSurveyPeriod() {
  return state.selectedMonth === "Current" ? state.summary?.latest_month : state.selectedMonth;
}

function submittedSurveyCount(features) {
  const period = selectedSurveyPeriod();
  const surveyRecords = state.surveyRecordsByPeriod[period] || [];
  const assignmentPins = new Set(
    features
      .map((feature) => parcelDigits(feature.properties?.parcel_key || feature.properties?.parcel_number))
      .filter(Boolean)
  );
  return surveyRecords.filter((record) => assignmentPins.has(parcelDigits(record.parcelnumb))).length;
}

async function ensureSurveyRecords(period = selectedSurveyPeriod()) {
  if (!period || state.surveyRecordsByPeriod[period]) return;
  const records = await fetchSurveyRecordsForPeriod(period).catch(() => []);
  state.surveyRecordsByPeriod[period] = records;
}

function surveyOnlyCount(features = currentMonthFeatures()) {
  const raw = surveyRecordCountForSelectedPeriod();
  return Math.max(raw - matchedReturnedCount(features), 0);
}

function statusRenderer(mode = state.dataView) {
  return {
    type: "unique-value",
    field: "completion_status",
    defaultSymbol: fillSymbol("#8a8f98"),
    uniqueValueInfos: Object.entries(statusColors).map(([value, color]) => ({
      value,
      label: statusLabel(value),
      symbol: fillSymbol(color)
    }))
  };
}

function contractorRenderer(mode = state.dataView) {
  return {
    type: "unique-value",
    field: "organization",
    defaultSymbol: fillSymbol("#8a8f98"),
    uniqueValueInfos: contractorItems().map((item) => ({
      value: item.name,
      label: item.label,
      symbol: fillSymbol(item.color)
    }))
  };
}


function assignmentHistoryWhereForFilter(mode = state.dataView) {
  if (mode !== "history") return whereForFilter(mode);
  const month = String(state.selectedMonth || state.datasets.history.summary.latest_month).replace(/'/g, "''");
  const clauses = [`period_month = '${month}'`];
  if (state.ownershipFilter !== "all") {
    const values = state.ownershipFilter === "URA" ? ["URA", "URA Owned"] : ["PLB", "PLB Owned", "Pittsburgh Land Bank"];
    clauses.push(`(ownership_group = ${sqlValue(state.ownershipFilter)} OR ownership_type IN (${values.map(sqlValue).join(", ")}))`);
  }
  if (state.districtFilter !== "all") {
    clauses.push(`council_district = ${sqlValue(state.districtFilter)}`);
  }
  if (state.contractorFilter !== "all") {
    clauses.push(`organization = ${sqlValue(state.contractorFilter)}`);
  }
  if (state.landcareStatusFilter !== "all") {
    clauses.push(`completion_status = ${sqlValue(state.landcareStatusFilter)}`);
  }
  return clauses.join(" AND ");
}

function whereForFilter(mode = state.dataView) {
  const clauses = [];
  if (mode === "current") {
    if (state.ownershipFilter !== "all") {
      const value = state.ownershipFilter === "URA" ? "URA Owned" : "PLB Owned";
      clauses.push(`(ownership_group = ${sqlValue(state.ownershipFilter)} OR ownership_type = ${sqlValue(state.ownershipFilter)} OR inventory_type = ${sqlValue(value)})`);
    }
    if (state.districtFilter !== "all") {
      clauses.push(`council_district = ${sqlValue(state.districtFilter)}`);
    }
  }
  if (mode === "history") {
    return assignmentHistoryWhereForFilter("history");
  }
  if (state.contractorFilter !== "all") {
    clauses.push(`organization = ${sqlValue(state.contractorFilter)}`);
  }
  return clauses.length ? clauses.join(" AND ") : "1=1";
}

function availableMonths() {
  const history = state.datasets?.history;
  return history?.summary.available_months || mergeAvailableMonths([], state.surveyPeriodStats);
}

function renderMonthOptions() {
  const field = document.querySelector("label[for='monthSelect']");
  const select = document.getElementById("monthSelect");
  const months = availableMonths();
  field.style.display = state.dataView === "history" ? "grid" : "none";
  select.innerHTML = months
    .map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`)
    .join("");
  select.value = state.selectedMonth;
}

function renderDistrictOptions() {
  const select = document.getElementById("districtSelect");
  if (!select) return;
  const options = districtItems();
  select.innerHTML = [
    `<option value="all">All council districts</option>`,
    ...options.map((item) =>
      `<option value="${escapeHtml(item.district)}">District ${escapeHtml(item.district)} - ${formatNumber(item.count)} parcels</option>`
    )
  ].join("");
  select.value = state.districtFilter;
}

function renderKpis() {
  const features = filteredFeatures();
  const assigned = uniqueCount(features);
  const submitted = submittedSurveyCount(features);
  const open = Math.max(assigned - submitted, 0);
  document.getElementById("latestMonthLabel").textContent = state.dataView === "current"
    ? "Current portfolio"
    : `${state.selectedMonth} monthly LandCare status`;
  document.getElementById("assignedKpiLabel").textContent = "Assigned";
  document.getElementById("submittedKpiLabel").textContent = "Submitted";
  document.getElementById("submittedKpiLabel").title = "Survey submissions joined to the current assignment and filter scope.";
  document.getElementById("openKpiLabel").textContent = "Open";
  document.getElementById("assignedKpi").textContent = formatNumber(assigned);
  document.getElementById("submittedKpi").textContent = formatNumber(submitted);
  document.getElementById("openKpi").textContent = formatNumber(open);
}

function renderContractors() {
  const container = document.getElementById("contractorList");
  container.innerHTML = contractorItems().map((item) => {
    const rate = pct(item.returned, item.count);
    const currentRate = pct(item.active, item.count);
    const muted = state.contractorFilter !== "all" && state.contractorFilter !== item.name;
    return `
      <button class="contractor-row ${muted ? "is-muted" : ""}" type="button" data-contractor="${escapeHtml(item.name)}">
        <span class="contractor-dot" style="background:${item.color}"></span>
        <span>
          <strong>${escapeHtml(item.label)}</strong>
          <small>${
            state.dataView === "current"
              ? `${formatNumber(item.count)} parcels - ${formatNumber(item.active)} active, ${formatNumber(item.requestOnly)} request only`
              : `${formatNumber(item.count)} parcels - ${formatNumber(item.returned)} returned`
          }</small>
        </span>
        <em>${state.dataView === "current" ? currentRate : rate}</em>
      </button>
    `;
  }).join("");
}

function statusSummaryFeatures() {
  return districtFilteredFeatures();
}

function renderStatusSummary() {
  const container = document.getElementById("statusSummaryList");
  if (!container) return;
  const counts = statusSummaryFeatures().reduce((acc, feature) => {
    const status = feature.properties.completion_status || "missing";
    const parcelKey = feature.properties.parcel_key;
    if (!parcelKey) return acc;
    acc[status] ||= new Set();
    acc[status].add(parcelKey);
    return acc;
  }, {});
  const orderedStatuses =
    state.dataView === "current"
      ? ["current_active", "request_only"]
      : ["returned", "missing", "request_only", "survey_only", "ownership_risk"];
  container.innerHTML = `
    <div class="status-summary-title">LandCare Status</div>
    ${orderedStatuses
      .filter((status) => counts[status]?.size || ["returned", "missing", "request_only"].includes(status))
      .map((status) => `
        <div class="status-summary-row">
          <span class="legend-swatch" style="background:${statusColors[status]}"></span>
          <strong>${escapeHtml(statusLabel(status))}</strong>
          <em>${formatNumber(counts[status]?.size || 0)}</em>
        </div>
      `)
      .join("")}
  `;
}

function renderLegend() {
  const heading = document.getElementById("legendHeading");
  const list = document.getElementById("legendList");
  document.querySelector("[data-color-mode='status']").textContent =
    "LandCare Status";
  if (state.colorMode === "contractor") {
    heading.textContent = "Map Key — Assignments";
    list.innerHTML = contractorItems().map((item) => `
      <button class="legend-item legend-button ${state.contractorFilter === item.name ? "is-active" : ""}" type="button" data-contractor="${escapeHtml(item.name)}">
        <span class="legend-swatch" style="background:${item.color}"></span>
        <strong>${escapeHtml(item.label)}</strong>
      </button>
    `).join("");
    return;
  }

  heading.textContent = "Map Key — LandCare Status";
  const legendFeatures = districtFilteredFeatures().filter((feature) =>
    state.contractorFilter === "all" || feature.properties.organization === state.contractorFilter
  );
  const counts = legendFeatures.reduce((acc, feature) => {
    const status = feature.properties.completion_status || "missing";
    const parcelKey = feature.properties.parcel_key;
    if (!parcelKey) return acc;
    acc[status] ||= new Set();
    acc[status].add(parcelKey);
    return acc;
  }, {});
  const statuses = state.dataView === "current"
    ? ["current_active", "request_only"]
    : ["returned", "missing", "request_only"];
  const allButton = state.dataView === "history"
    ? `<button class="legend-item legend-button ${state.landcareStatusFilter === "all" ? "is-active" : ""}" type="button" data-landcare-status="all">
        <span class="legend-swatch" style="background:#8a8f98"></span>
        <strong>All LandCare status</strong>
      </button>`
    : "";
  list.innerHTML = allButton + statuses
    .map((status) => [status, statusColors[status]])
    .filter(([status]) => {
      if (counts[status]?.size) return true;
      return state.dataView === "history" && ["returned", "missing", "request_only"].includes(status);
    })
    .map(([status, color]) => {
      const tag = state.dataView === "history" ? "button" : "div";
      const attrs = state.dataView === "history"
        ? `class="legend-item legend-button ${state.landcareStatusFilter === status ? "is-active" : ""}" type="button" data-landcare-status="${escapeHtml(status)}"`
        : `class="legend-item"`;
      return `
      <${tag} ${attrs}>
        <span class="legend-swatch" style="background:${color}"></span>
        <strong>${statusLabel(status)}</strong>
      </${tag}>
    `;
    }).join("");
}

function renderActionFocus() {
  const features = filteredFeatures();
  if (state.dataView === "current") {
    const active = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Active");
    const requestOnly = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Request Only");
    const neighborhoods = new Set(features.map((feature) => feature.properties.neighborhood).filter(Boolean)).size;
    const label = state.contractorFilter === "all" ? "all contractors" : shortContractor(state.contractorFilter);
    const districtText = state.districtFilter === "all" ? "citywide" : `Council District ${state.districtFilter}`;
    document.getElementById("actionFocus").innerHTML = `
      <div class="action-directive"><strong>Focus</strong><span>${escapeHtml(label)}: confirm active workload coverage for ${escapeHtml(districtText)} before the next survey review.</span></div>
      <div><strong>${formatNumber(active)}</strong><span>Active assignments requiring recurring survey follow-up</span></div>
      <div><strong>${formatNumber(requestOnly)}</strong><span>Request-only records separated from compliance scoring</span></div>
      <div><strong>${formatNumber(neighborhoods)}</strong><span>Neighborhoods represented in the current filter</span></div>
    `;
    return;
  }
  const monthFeatures = districtFilteredFeatures();
  const rows = contractorPerformanceRows(monthFeatures);
  const selectedRow = rows.find((row) => row.organization === state.contractorFilter);
  const worstRow = [...rows].sort((a, b) => b.open - a.open || a.rate - b.rate)[0];
  const focusRow = selectedRow || worstRow;
  const overallActive = uniqueCount(monthFeatures, (feature) => feature.properties.maintenance_level === "Active");
  const overallReturned = uniqueCount(monthFeatures, (feature) => feature.properties.returned_flag);
  const overallRate = overallActive ? (100 * overallReturned) / overallActive : 0;
  const activeOpen = uniqueCount(
    features,
    (feature) =>
      feature.properties.maintenance_level === "Active" &&
      feature.properties.completion_status === "missing"
  );
  const submitted = submittedSurveyCount(features);
  const requestOnly = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Request Only");
  const rawSurveys = surveyRecordCountForSelectedPeriod();
  const surveyOnly = surveyOnlyCount(monthFeatures);
  const directive = focusRow
    ? state.contractorFilter === "all"
      ? `Start with ${shortContractor(focusRow.organization)}: ${formatNumber(focusRow.open)} open active parcels in ${state.selectedMonth}, ${pct(focusRow.returned, focusRow.assigned)} complete versus ${overallRate.toFixed(1)}% overall.`
      : `${shortContractor(focusRow.organization)} has ${formatNumber(focusRow.open)} open active parcels in ${state.selectedMonth}; review missing survey evidence before monthly close.`
    : `No contractor issue detected for ${state.selectedMonth}.`;
  document.getElementById("actionFocus").innerHTML = `
    <div class="action-directive"><strong>Action</strong><span>${escapeHtml(directive)}</span></div>
    <div><strong>${formatNumber(activeOpen)}</strong><span>Open active parcels in current filter</span></div>
    <div><strong>${formatNumber(submitted)}</strong><span>Submitted survey records joined to assignments</span></div>
    <div><strong>${formatNumber(rawSurveys)}</strong><span>All live survey records for ${escapeHtml(state.selectedMonth)}</span></div>
    <div><strong>${formatNumber(surveyOnly)}</strong><span>Survey-only records outside the matched assignment count</span></div>
    <div><strong>${formatNumber(requestOnly)}</strong><span>Request-only assignments excluded from active compliance</span></div>
  `;
}

function fieldNotesForCurrentFilters() {
  const featuresByParcel = new globalThis.Map();
  for (const feature of filteredFeatures()) {
    const parcelKey = parcelDigits(feature.properties?.parcel_key || feature.properties?.parcel_number);
    if (parcelKey && !featuresByParcel.has(parcelKey)) featuresByParcel.set(parcelKey, feature);
  }
  const period = selectedSurveyPeriod();
  return (state.surveyRecordsByPeriod[period] || [])
    .map((record) => {
      const note = String(record.additional_notes || record.additional_comments || record.additional_note || record.notes || "").trim();
      const feature = featuresByParcel.get(parcelDigits(record.parcelnumb));
      return note && feature ? { record, feature, note } : null;
    })
    .filter(Boolean)
    .sort((left, right) => String(right.record.created_at || "").localeCompare(String(left.record.created_at || "")));
}

function renderFieldNotes() {
  const list = document.getElementById("fieldNotes");
  const count = document.getElementById("fieldNotesCount");
  if (!list || !count) return;
  const notes = fieldNotesForCurrentFilters();
  count.textContent = notes.length ? `${formatNumber(notes.length)} note${notes.length === 1 ? "" : "s"}` : "No notes";
  if (!notes.length) {
    list.innerHTML = '<p class="field-notes-empty">No field notes match the current map filters.</p>';
    list._notes = [];
    return;
  }
  list._notes = notes;
  list.innerHTML = notes.map(({ record, feature, note }, index) => {
    const props = feature.properties || {};
    const date = evidenceDate(record.service_date || record.date_of_services || record.date_services || record.created_at);
    const dateText = date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Date unavailable";
    return `<button class="field-note-row" type="button" data-field-note-index="${index}" aria-label="Open parcel ${escapeHtml(props.block_lot || props.parcel_key || record.parcelnumb)}">
      <span class="field-note-row__parcel">${escapeHtml(props.block_lot || props.parcel_key || record.parcelnumb)}</span>
      <span class="field-note-row__date">${escapeHtml(dateText)}</span>
      <span class="field-note-row__text">${escapeHtml(note)}</span>
    </button>`;
  }).join("");
}

function contractorPerformanceRows(features) {
  const rows = {};
  for (const feature of features) {
    const props = feature.properties || {};
    const org = props.organization || "Unassigned";
    const parcelKey = props.parcel_key;
    if (!parcelKey || props.maintenance_level !== "Active") continue;
    rows[org] ||= { organization: org, assignedKeys: new Set(), returnedKeys: new Set() };
    rows[org].assignedKeys.add(parcelKey);
    if (props.returned_flag) rows[org].returnedKeys.add(parcelKey);
  }
  return Object.values(rows).map((row) => {
    const assigned = row.assignedKeys.size;
    const returned = row.returnedKeys.size;
    return {
      organization: row.organization,
      assigned,
      returned,
      open: Math.max(assigned - returned, 0),
      rate: assigned ? (100 * returned) / assigned : 0
    };
  });
}

function renderFreshness() {
  const assignmentEdited = state.assignmentLayerInfo?.history?.dataLastEdit;
  const surveyEdited = state.surveyLayerInfo?.dataLastEdit || state.datasets?.history?.summary?.survey_layer_summary?.data_last_edit;
  document.getElementById("freshnessNote").textContent =
    state.dataView === "history"
      ? `Assignments: live ArcGIS${assignmentEdited ? ` ${assignmentEdited}` : ""} | Surveys: live ArcGIS${surveyEdited ? ` ${surveyEdited}` : ""}`
      : "Current LandCare universe";
  if (state.dataView === "current") {
    const visibleFeatures = filteredFeatures();
    const districtText = state.districtFilter === "all" ? "all council districts" : `Council District ${state.districtFilter}`;
    const contractorText =
      state.contractorFilter === "all" ? "all contractors" : shortContractor(state.contractorFilter);
    document.getElementById("mapBadge").textContent =
      `${formatNumber(visibleFeatures.length)} records / ${formatNumber(uniqueCount(visibleFeatures))} parcels — ${ownershipLabel(state.ownershipFilter)}`;
    document.getElementById("mapCallout").innerHTML = `
      <strong>Current ${escapeHtml(ownershipLabel(state.ownershipFilter))} LandCare universe</strong>
      <span>${escapeHtml(districtText)} - ${escapeHtml(contractorText)}${state.mapFocusLabel ? ` - ${escapeHtml(state.mapFocusLabel)}` : ""}${state.currentDataWarning ? ` - ${escapeHtml(state.currentDataWarning)}` : ""}</span>
    `;
    return;
  }
  const visibleFeatures = filteredFeatures();
  document.getElementById("mapBadge").textContent =
    `${formatNumber(uniqueCount(visibleFeatures))} assigned parcels — ${ownershipLabel(state.ownershipFilter)} — ${state.selectedMonth}`;
  const rawSurveys = surveyRecordCountForSelectedPeriod();
  const monthFeatures = districtFilteredFeatures();
  const matchedReturned = matchedReturnedCount(monthFeatures);
  const openActive = uniqueCount(monthFeatures, (feature) => feature.properties.completion_status === "missing");
  const requestOnly = uniqueCount(monthFeatures, (feature) => feature.properties.maintenance_level === "Request Only");
  const colorText = state.colorMode === "contractor" ? "contractor" : "LandCare status";
  document.getElementById("mapCallout").innerHTML = `
    <strong>${escapeHtml(state.selectedMonth)} LandCare coverage</strong>
    <span>${formatNumber(matchedReturned)} survey complete, ${formatNumber(openActive)} open active, ${formatNumber(requestOnly)} request only. ${formatNumber(rawSurveys)} live survey records. Colored by ${escapeHtml(colorText)}.</span>
  `;
}

function parcelDetail(props) {
  if (state.dataView === "current") {
    return `
      <strong>${escapeHtml(props.parcel_key)}</strong><br>
      Property ID: ${escapeHtml(props.property_id || "Unknown")}<br>
      Contractor: ${escapeHtml(props.organization)}<br>
      LandCare status: ${escapeHtml(props.maintenance_level)}<br>
      Property status: ${escapeHtml(props.current_status || "Unknown")}<br>
      Council district: ${escapeHtml(props.council_district || "Unknown")}<br>
      Neighborhood: ${escapeHtml(props.neighborhood || "Unknown")}<br>
      Census tract: ${escapeHtml(props.census_tract || "Unknown")}<br>
      Project: ${escapeHtml(props.project_name || "None")}<br>
      Inventory: ${escapeHtml(props.inventory_type || "Unknown")}<br>
      Ownership: ${escapeHtml(ownershipLabel(props.ownership_group || props.ownership_type || props.inventory_type))}<br>
      Block &amp; lot: ${escapeHtml(props.block_lot || "Unknown")}<br>
      Property class: ${escapeHtml(props.property_class || "Unknown")}<br>
      Zoning: ${escapeHtml(props.zoning || "Unknown")}<br>
      Area: ${formatAcres(props.acreage || (props.parcel_sqft ? props.parcel_sqft / 43560 : 0))} <span class="muted">(${escapeHtml(props.area_source || "ArcGIS area field")})</span><br>
      Parcel sq ft: ${formatNumber(props.parcel_sqft)}<br>
      Tags: ${escapeHtml(props.tags || "None")}<br>
      Modified: ${escapeHtml(props.mod_dt || "Unknown")}
      ${props.history_note ? `<br><strong>${escapeHtml(props.history_note)}</strong>` : ""}
    `;
  }
  return `
    <strong>${escapeHtml(props.parcel_key)}</strong><br>
    Contractor: ${escapeHtml(props.organization)}<br>
    Survey month: ${escapeHtml(props.period_month)}<br>
    Maintenance level: ${escapeHtml(props.maintenance_level)}<br>
    Status: ${escapeHtml(statusLabel(props.completion_status))}<br>
    Ownership: ${escapeHtml(ownershipLabel(props.ownership_group || props.ownership_type))}<br>
    ${props.block_lot ? `Block &amp; lot: ${escapeHtml(props.block_lot)}<br>` : ""}
    Owner: ${escapeHtml(props.owner_name || "Unknown")}<br>
    Source: ${escapeHtml(props.survey_source || "Monthly assurance layer")}<br>
    ${props.created_at ? `Evidence submitted: ${escapeHtml(props.created_at)}<br>` : ""}
    ${props.survey_status ? `Survey status: ${escapeHtml(props.survey_status)}<br>` : ""}
    ${props.history_note ? `<strong>${escapeHtml(props.history_note)}</strong><br>` : ""}
    ${evidenceCommentPaneMarkup(props)}
    ${surveyPhotoGalleryMarkup(props)}
  `;
}

function setParcelDetail(props) {
  const detail = document.getElementById("parcelDetail");
  detail.innerHTML = parcelDetail(props);
  bindPhotoFallbacks(detail);
}

async function enrichWithSurveyEvidence(props) {
  const parcelKey = props.parcel_key || props.parcelnumb || props.parcel_number;
  const cacheKey = `${parcelDigits(parcelKey)}:${state.selectedMonth || "Current"}`;
  if (!parcelKey) return props;

  const selectedPeriod = state.selectedMonth === "Current" ? null : state.selectedMonth;
  const survey123Period = selectedPeriod || state.summary?.latest_month;
  const survey123Evidence = (state.survey123EvidenceByPeriod[survey123Period] || [])
    .filter((record) => survey123EvidenceMatchesAssignment(record, props))
    .flatMap((record) => record.evidence_photos || []);
  let evidence = state.evidenceCache.get(cacheKey);
  if (evidence === undefined) {
    evidence = await fetchSurveyEvidenceForParcel(parcelKey, selectedPeriod).catch(() => []);
    state.evidenceCache.set(cacheKey, evidence);
  }
  const periodEvidence = [
    ...survey123Evidence,
    ...evidence.map((photo) => ({ ...photo, survey_source: SURVEY_LAYER_NAME }))
  ].filter((record, index, all) => {
    const imageUrl = safeImageUrl(record.image_url);
    const notes = String(record.additional_notes || record.additional_comments || record.additional_note || record.notes || "").trim();
    if (!imageUrl && !notes) return false;
    const key = imageUrl || `${record.OBJECTID || record.objectid || ""}:${record.created_at || record.submitted_at || record.service_date || ""}:${notes}`;
    return all.findIndex((candidate) => {
      const candidateImageUrl = safeImageUrl(candidate.image_url);
      const candidateNotes = String(candidate.additional_notes || candidate.additional_comments || candidate.additional_note || candidate.notes || "").trim();
      return (candidateImageUrl || `${candidate.OBJECTID || candidate.objectid || ""}:${candidate.created_at || candidate.submitted_at || candidate.service_date || ""}:${candidateNotes}`) === key;
    }) === index;
  })
    .sort((a, b) => String(b.created_at || b.submitted_at || b.service_date || "").localeCompare(String(a.created_at || a.submitted_at || a.service_date || "")));
  if (!periodEvidence.length) return { ...props, evidence_photos: [] };
  const latest = periodEvidence[0];
  return {
    ...props,
    image_url: latest.image_url,
    created_at: latest.created_at || latest.submitted_at,
    address: latest.address || props.address,
    survey_status: latest.status || (latest.evidence_source ? "Complete evidence received" : props.survey_status),
    survey_source: latest.survey_source,
    evidence_photos: periodEvidence
  };
}

function updateDistrictHighlight() {
  if (!state.boundaryLayers.councilHighlight) return;
  state.boundaryLayers.councilHighlight.definitionExpression =
    state.districtFilter !== "all"
      ? `DIST_ID = ${Number(state.districtFilter)}`
      : "1=0";
}

function extentIsUsable(extent) {
  if (!extent) return false;
  const { xmin, ymin, xmax, ymax } = extent;
  return [xmin, ymin, xmax, ymax].every((value) => Number.isFinite(value)) && xmax > xmin && ymax > ymin;
}

function currentZoomWhere({ contractor = state.contractorFilter, district = state.districtFilter, neighborhood = null } = {}) {
  const clauses = isLiveCurrentDataset() ? [CURRENT_WHERE] : [];
  if (state.ownershipFilter !== "all") {
    const value = state.ownershipFilter === "URA" ? "URA Owned" : "PLB Owned";
    clauses.push(isLiveCurrentDataset()
      ? `inventory_type = ${sqlValue(value)}`
      : `(ownership_group = ${sqlValue(state.ownershipFilter)} OR ownership_type = ${sqlValue(state.ownershipFilter)})`);
  }
  if (district && district !== "all") clauses.push(`council_district = ${sqlValue(district)}`);
  const contactClause = contractorContactClause(contractor);
  if (contactClause) clauses.push(contactClause);
  if (!isLiveCurrentDataset() && contractor && contractor !== "all") clauses.push(`organization = ${sqlValue(contractor)}`);
  if (neighborhood) clauses.push(`neighborhood = ${sqlValue(neighborhood)}`);
  return clauses.length ? clauses.join(" AND ") : "1=1";
}

async function zoomToCurrentWhere(where, { expand = 1.18, duration = 650 } = {}) {
  const layer = state.layers.current;
  if (!state.view || !layer?.queryExtent) return false;
  const result = await layer.queryExtent({
    where,
    outSpatialReference: state.view.spatialReference
  }).catch(() => null);
  if (!result?.count || !extentIsUsable(result.extent)) return false;
  await state.view.goTo(result.extent.expand(expand), { duration }).catch(() => {});
  return true;
}

async function zoomToDefaultCurrent() {
  state.mapFocusLabel = "";
  if (!state.view) return;
  await state.view.goTo({ center: [-79.9959, 40.4406], zoom: 13 }, { duration: 650 }).catch(() => {});
}

async function zoomToDistrictBoundary(district, { expand = 1.08, duration = 650 } = {}) {
  const layer = state.boundaryLayers.council || state.boundaryLayers.councilHighlight;
  if (!state.view || !layer?.queryExtent) return false;
  const districtId = Number(district);
  if (!Number.isFinite(districtId)) return false;
  const result = await layer.queryExtent({
    where: `DIST_ID = ${districtId}`,
    outSpatialReference: state.view.spatialReference
  }).catch(() => null);
  if (!result?.count || !extentIsUsable(result.extent)) return false;
  await state.view.goTo(result.extent.expand(expand), { duration }).catch(() => {});
  return true;
}

async function zoomToDistrict(district = state.districtFilter) {
  if (district === "all") {
    await zoomToDefaultCurrent();
    return;
  }
  state.mapFocusLabel = "district focus";
  const focused = await zoomToDistrictBoundary(district);
  if (focused) return;
  if (state.dataView === "current") {
    await zoomToCurrentWhere(currentZoomWhere({ contractor: "all", district }), { expand: 1.12 });
  }
}

async function zoomToActiveFilteredExtent({ expand = 1.16, duration = 650 } = {}) {
  if (!state.view) return;
  const layers = state.dataView === "history" ? historyLayers() : [activeLayer()].filter(Boolean);
  const extents = [];
  for (const layer of layers) {
    if (!layer?.queryExtent) continue;
    const result = await layer.queryExtent({
      where: assignmentHistoryWhereForFilter("history"),
      outSpatialReference: state.view.spatialReference
    }).catch(() => null);
    if (result?.count && extentIsUsable(result.extent)) extents.push(result.extent);
  }
  if (!extents.length) return;
  let target = extents[0];
  for (let index = 1; index < extents.length; index += 1) {
    target = target.union(extents[index]);
  }
  await state.view.goTo(target.expand(expand), { duration }).catch(() => {});
}

async function zoomToSelectedExtent({ duration = 650 } = {}) {
  if (!state.view) return;
  const contractorSelected = state.contractorFilter !== "all";
  const districtSelected = state.districtFilter !== "all";
  const expand = contractorSelected ? 1.22 : districtSelected ? 1.14 : 1.08;
  if (districtSelected && !contractorSelected && state.landcareStatusFilter === "all") {
    await zoomToDistrict(state.districtFilter);
    return;
  }
  if (state.dataView === "current") {
    if (!contractorSelected && !districtSelected) {
      await zoomToDefaultCurrent();
      return;
    }
    await zoomToCurrentWhere(
      currentZoomWhere({
        contractor: state.contractorFilter,
        district: state.districtFilter
      }),
      { expand, duration }
    );
    return;
  }
  await zoomToActiveFilteredExtent({ expand, duration });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForViewPredicate(predicate, timeout = 8000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (predicate() || Date.now() - started > timeout) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function waitForMapRenderReady() {
  if (!state.view) return;
  await state.view.when();
  await waitForViewPredicate(() => state.view.stationary && !state.view.updating, 10000);
  const layer = activeLayer();
  if (layer) {
    const layerView = await state.view.whenLayerView(layer).catch(() => null);
    if (layerView) {
      await waitForViewPredicate(() => !layerView.updating, 10000);
    }
  }
  await delay(900);
}

function dominantNeighborhoodForContractor(name) {
  const counts = {};
  const features = districtFilteredFeatures().filter((feature) => feature.properties.organization === name);
  for (const feature of features) {
    const neighborhood = feature.properties.neighborhood;
    if (!neighborhood) continue;
    counts[neighborhood] = (counts[neighborhood] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

async function zoomToContractorCluster(name) {
  if (!name || name === "all") {
    await zoomToSelectedExtent();
    return;
  }
  state.mapFocusLabel = "contractor selection";
  await zoomToSelectedExtent();
}

function setColorMode(mode) {
  state.colorMode = mode === "contractor" ? "contractor" : "status";
  document.querySelectorAll("[data-color-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.colorMode === state.colorMode);
  });
  if (state.dataView === "history") {
    if (state.layers.historyAssignments) {
      state.layers.historyAssignments.renderer =
        state.colorMode === "contractor" ? contractorRenderer("history") : statusRenderer("history");
    }
  } else if (state.layers.current) {
    state.layers.current.renderer = state.colorMode === "contractor" ? contractorRenderer() : statusRenderer();
  }
  renderLegend();
  renderFreshness();
}

async function setDistrictFilter(district, { zoom = true } = {}) {
  state.districtFilter = district || "all";
  state.mapFocusLabel = state.districtFilter === "all" ? "" : "district focus";
  if (state.dataView === "history") {
    syncHistoryLayerFilters();
  } else if (state.layers.current) {
    state.layers.current.definitionExpression = whereForFilter("current");
  }
  updateDistrictHighlight();
  await ensureSurveyRecords();
  renderAll();
  if (zoom) await zoomToDistrict(state.districtFilter);
}

async function setContractorFilter(name, { zoom = false } = {}) {
  state.contractorFilter = name || "all";
  if (state.contractorFilter !== "all" && state.colorMode !== "contractor") {
    setColorMode("contractor");
  }
  if (state.contractorFilter === "all") {
    state.mapFocusLabel = state.districtFilter === "all" ? "" : "district focus";
  }
  if (state.dataView === "history") {
    syncHistoryLayerFilters();
  } else if (state.layers.current) {
    state.layers.current.definitionExpression = whereForFilter("current");
  }
  renderKpis();
  renderContractors();
  renderActionFocus();
  renderFreshness();
  if (zoom) {
    await zoomToSelectedExtent();
    renderFreshness();
  }
}

async function setOwnershipFilter(group, { zoom = true } = {}) {
  state.ownershipFilter = ["all", "URA", "PLB"].includes(group) ? group : "URA";
  state.ownershipFilterByView[state.dataView] = state.ownershipFilter;
  document.querySelectorAll("[data-ownership-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.ownershipFilter === state.ownershipFilter);
  });
  if (state.dataView === "history") syncHistoryLayerFilters();
  else if (state.layers.current) state.layers.current.definitionExpression = whereForFilter("current");
  renderAll();
  if (zoom) await zoomToSelectedExtent({ duration: 450 });
}

async function setLandcareStatusFilter(status, { zoom = false } = {}) {
  state.landcareStatusFilter = status || "all";
  syncHistoryLayerFilters();
  renderKpis();
  renderStatusSummary();
  renderContractors();
  renderLegend();
  renderActionFocus();
  renderFreshness();
  if (zoom) await zoomToSelectedExtent({ duration: 450 });
}

function setActiveDataset() {
  const dataset = state.datasets[state.dataView];
  state.summary = dataset.summary;
  state.geojson = dataset.geojson;
  if (state.dataView === "current") {
    state.selectedMonth = "Current";
    return;
  }
  const months = availableMonths();
  state.selectedMonth = months.includes(state.selectedMonth) ? state.selectedMonth : dataset.summary.latest_month;
}

function syncHistoryLayerFilters() {
  if (state.layers.historyAssignments) {
    state.layers.historyAssignments.definitionExpression = assignmentHistoryWhereForFilter("history");
  }
}

function setHistoryLayerVisibility(visible) {
  if (state.layers.historyAssignments) state.layers.historyAssignments.visible = visible;
}

function activeLayer() {
  if (state.dataView === "current") return state.layers.current;
  return state.layers.historyAssignments;
}

function historyLayers() {
  return [state.layers.historyAssignments].filter(Boolean);
}

function renderAll() {
  renderMonthOptions();
  renderDistrictOptions();
  renderKpis();
  renderStatusSummary();
  renderContractors();
  renderLegend();
  renderActionFocus();
  renderFieldNotes();
  renderFreshness();
}

async function setDataView(mode) {
  state.dataView = mode === "history" ? "history" : "current";
  state.ownershipFilter = state.ownershipFilterByView[state.dataView];
  document.querySelectorAll("[data-ownership-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.ownershipFilter === state.ownershipFilter);
  });
  state.mapFocusLabel = "";
  setActiveDataset();
  const dataViewSelect = document.getElementById("dataViewSelect");
  if (dataViewSelect) dataViewSelect.value = state.dataView;
  setHistoryLayerVisibility(state.dataView === "history");
  if (state.layers.current) {
    state.layers.current.visible = state.dataView === "current";
    state.layers.current.definitionExpression = whereForFilter("current");
    if (state.dataView === "current") {
      state.layers.current.renderer = state.colorMode === "contractor" ? contractorRenderer() : statusRenderer();
    }
  }
  syncHistoryLayerFilters();
  if (state.layers.historyAssignments) {
    state.layers.historyAssignments.renderer =
      state.colorMode === "contractor" ? contractorRenderer("history") : statusRenderer("history");
  }
  updateDistrictHighlight();
  renderAll();
  await zoomToSelectedExtent({ duration: 450 });
}

async function setMonthFilter(month) {
  state.dataView = "history";
  state.ownershipFilter = state.ownershipFilterByView.history;
  document.querySelectorAll("[data-ownership-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.ownershipFilter === state.ownershipFilter);
  });
  setActiveDataset();
  state.selectedMonth = month || state.summary.latest_month;
  state.mapFocusLabel = "";
  setHistoryLayerVisibility(true);
  if (state.layers.current) state.layers.current.visible = false;
  syncHistoryLayerFilters();
  updateDistrictHighlight();
  await ensureSurveyRecords();
  renderAll();
  document.getElementById("parcelDetail").textContent =
    "Select a parcel to review contractor, status, ownership, and survey period.";
  await zoomToSelectedExtent({ duration: 450 });
}

function parcelSearchCandidates(query) {
  const normalizedBlockLot = normalizeBlockLot(query);
  const normalizedPin = parcelDigits(query);
  if (!normalizedBlockLot && !normalizedPin) return [];
  return (state.datasets?.current?.geojson?.features || [])
    .filter((feature) => {
      const props = feature.properties || {};
      const blockLot = normalizeBlockLot(props.block_lot);
      const pin = parcelDigits(props.parcel_number || props.parcel_key);
      return normalizedPin.length >= 8 ? pin.includes(normalizedPin) : blockLot.includes(normalizedBlockLot);
    })
    .slice(0, 8);
}

function renderParcelSearchResults(query = "") {
  const container = document.getElementById("parcelSearchResults");
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    container.replaceChildren();
    return;
  }
  const results = parcelSearchCandidates(trimmed);
  if (!results.length) {
    container.innerHTML = '<span class="field-help">No active URA or PLB LandCare parcel matched that search.</span>';
    return;
  }
  container.innerHTML = results.map((feature, index) => {
    const props = feature.properties || {};
    return `<button class="parcel-search-result" type="button" data-parcel-search-result="${index}">
      <strong>${escapeHtml(props.block_lot || props.parcel_number || props.parcel_key)}</strong>
      <span>${escapeHtml(ownershipLabel(props.ownership_group))} · ${escapeHtml(props.parcel_number || props.parcel_key)}${props.address ? ` · ${escapeHtml(props.address)}` : ""}</span>
    </button>`;
  }).join("");
  container._results = results;
}

function featureCenter(feature) {
  const points = feature?.geometry?.coordinates?.flat?.(Infinity) || [];
  const numbers = points.filter((value) => typeof value === "number");
  if (numbers.length < 4) return null;
  const xs = numbers.filter((_, index) => index % 2 === 0);
  const ys = numbers.filter((_, index) => index % 2 === 1);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

async function selectParcelSearchResult(feature) {
  const props = feature.properties || {};
  const group = ownershipGroup(props.ownership_group || props.ownership_type || props.inventory_type);
  await setOwnershipFilter(group === "Other" ? "all" : group, { zoom: false });
  const selectedMonthRow = state.dataView === "history"
    ? (state.geojson?.features || []).find((row) => row.properties?.period_month === state.selectedMonth && parcelDigits(row.properties?.parcel_key) === parcelDigits(props.parcel_key))
    : null;
  const detail = selectedMonthRow
    ? { ...selectedMonthRow.properties, block_lot: selectedMonthRow.properties.block_lot || props.block_lot, ownership_group: group }
    : state.dataView === "history"
      ? { ...props, ownership_group: group, history_note: `No assignment in ${state.selectedMonth}.` }
      : props;
  setParcelDetail(detail);
  const enriched = await enrichWithSurveyEvidence(detail);
  setParcelDetail(enriched);
  const center = featureCenter(feature);
  if (center) await state.view?.goTo({ center, zoom: 18 }, { duration: 500 }).catch(() => {});
}

function wireControls() {
  document.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-color-mode]");
    if (modeButton) setColorMode(modeButton.dataset.colorMode);

    const contractorButton = event.target.closest("[data-contractor]");
    if (contractorButton) {
      const name = contractorButton.dataset.contractor;
      setContractorFilter(state.contractorFilter === name ? "all" : name, { zoom: true });
    }

    const landcareStatusButton = event.target.closest("[data-landcare-status]");
    if (landcareStatusButton) {
      const status = landcareStatusButton.dataset.landcareStatus;
      setLandcareStatusFilter(state.landcareStatusFilter === status ? "all" : status, { zoom: true });
    }

    const ownershipButton = event.target.closest("[data-ownership-filter]");
    if (ownershipButton) setOwnershipFilter(ownershipButton.dataset.ownershipFilter);

    const searchButton = event.target.closest("[data-parcel-search-result]");
    if (searchButton) {
      const results = document.getElementById("parcelSearchResults")._results || [];
      selectParcelSearchResult(results[Number(searchButton.dataset.parcelSearchResult)]);
    }

    const fieldNoteButton = event.target.closest("[data-field-note-index]");
    if (fieldNoteButton) {
      const notes = document.getElementById("fieldNotes")._notes || [];
      const note = notes[Number(fieldNoteButton.dataset.fieldNoteIndex)];
      if (note?.feature) selectParcelSearchResult(note.feature);
    }
  });
  document.getElementById("clearContractorButton").addEventListener("click", () => setContractorFilter("all", { zoom: true }));
  document.getElementById("clearDistrictButton").addEventListener("click", () => setDistrictFilter("all", { zoom: true }));
  document.getElementById("districtSelect").addEventListener("change", (event) => setDistrictFilter(event.target.value, { zoom: true }));
  document.getElementById("monthSelect").addEventListener("change", (event) => setMonthFilter(event.target.value));
  document.getElementById("parcelSearchInput").addEventListener("input", (event) => renderParcelSearchResults(event.target.value));
  document.getElementById("mapLegendToggle").addEventListener("click", () => {
    const legend = document.getElementById("mapLegend");
    const collapsed = legend.classList.toggle("is-collapsed");
    const toggle = document.getElementById("mapLegendToggle");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.lastElementChild.textContent = collapsed ? "+" : "−";
  });
  const syncLegendForViewport = () => {
    const legend = document.getElementById("mapLegend");
    const toggle = document.getElementById("mapLegendToggle");
    const shouldCollapse = window.matchMedia("(max-width: 620px)").matches;
    legend.classList.toggle("is-collapsed", shouldCollapse);
    toggle.setAttribute("aria-expanded", String(!shouldCollapse));
    toggle.lastElementChild.textContent = shouldCollapse ? "+" : "−";
  };
  syncLegendForViewport();
  window.addEventListener("resize", syncLegendForViewport);
  document.getElementById("exportPdfButton").addEventListener("click", openExportMetricsDialog);
  document.getElementById("confirmExportButton").addEventListener("click", confirmExportMetrics);
}

function selectedExportMetricKeys() {
  return Array.from(document.querySelectorAll("[data-export-metric]:checked")).map((input) => input.dataset.exportMetric);
}

function openExportMetricsDialog() {
  const dialog = document.getElementById("exportMetricsDialog");
  const validation = document.getElementById("exportMetricValidation");
  validation.textContent = "";
  syncExportMetricAvailability();
  if (!document.querySelector("[data-export-metric]:checked")) {
    DEFAULT_EXPORT_METRICS.forEach((key) => {
      const input = document.querySelector(`[data-export-metric="${key}"]`);
      if (input && !input.disabled) input.checked = true;
    });
  }
  if (typeof dialog.showModal === "function") dialog.showModal();
  else exportPrintPdf(DEFAULT_EXPORT_METRICS);
}

function syncExportMetricAvailability() {
  const budget = exportBudgetStats();
  const rankAvailable = state.contractorFilter !== "all";
  const availability = {
    annualRunRate: Boolean(budget),
    monthlyRunRate: Boolean(budget),
    rank: rankAvailable
  };
  Object.entries(availability).forEach(([key, available]) => {
    const input = document.querySelector(`[data-export-metric="${key}"]`);
    if (!input) return;
    input.disabled = !available;
    if (!available) input.checked = false;
    input.closest("label")?.classList.toggle("is-unavailable", !available);
  });
}

function confirmExportMetrics() {
  const keys = selectedExportMetricKeys();
  const validation = document.getElementById("exportMetricValidation");
  if (!keys.length) {
    validation.textContent = "Select at least one metric for the executive brief.";
    return;
  }
  document.getElementById("exportMetricsDialog").close();
  exportPrintPdf(keys);
}

function exportStats(features) {
  const active = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Active");
  const returned = uniqueCount(features, (feature) => feature.properties.returned_flag);
  const requestOnly = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Request Only");
  const open = uniqueCount(features, (feature) => feature.properties.completion_status === "missing");
  const assigned = uniqueCount(features);
  const neighborhoods = new Set(features.map((feature) => feature.properties.neighborhood).filter(Boolean)).size;
  return { active, returned, requestOnly, open, assigned, neighborhoods, acres: totalAcres(features), completionRate: pct(returned, active) };
}

function exportBudgetStats() {
  const finance = state.finance || {};
  const summary = finance.summary || {};
  const rows = finance.current_contracts || [];
  if (state.contractorFilter === "all") {
    return {
      monthlyRunRate: Number(summary.monthly_invoice_total || 0),
      annualRunRate: Number(summary.annual_invoice_run_rate || 0)
    };
  }
  const selected = rows.find((row) => financeContractorName(row.organization) === state.contractorFilter);
  if (!selected) return null;
  return {
    monthlyRunRate: Number(selected.monthly_invoice_amount || 0),
    annualRunRate: Number(selected.annual_invoice_run_rate || selected.twelve_month_contract_amount || 0)
  };
}

function contractorOpenRank() {
  if (state.contractorFilter === "all") return null;
  const rows = contractorPerformanceRows(districtFilteredFeatures())
    .sort((a, b) => b.open - a.open || a.rate - b.rate);
  const index = rows.findIndex((row) => row.organization === state.contractorFilter);
  return index >= 0 ? index + 1 : null;
}

function printLegendHtml() {
  if (state.colorMode === "contractor" || state.contractorFilter !== "all") {
    const items = contractorItems();
    const visibleItems = state.contractorFilter === "all"
      ? items
      : items.filter((item) => item.name === state.contractorFilter);
    return visibleItems.map((item) => `
    <div class="print-legend-row">
      <svg class="legend-chip" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="1.5" fill="${item.color}" stroke="#2b3942" stroke-opacity="0.42" stroke-width="1.2"></rect>
      </svg>
      <strong>${escapeHtml(item.label)}</strong>
    </div>
  `).join("");
  }
  if (state.dataView === "history") {
    const statuses = state.landcareStatusFilter === "all"
      ? ["returned", "missing", "request_only"]
      : [state.landcareStatusFilter];
    return statuses.map((status) => `
    <div class="print-legend-row">
      <svg class="legend-chip" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="1.5" fill="${statusColors[status]}" stroke="#2b3942" stroke-opacity="0.42" stroke-width="1.2"></rect>
      </svg>
      <strong>${escapeHtml(statusLabel(status))}</strong>
    </div>
  `).join("");
  }
  const statuses = state.dataView === "current"
    ? ["current_active", "request_only"]
    : ["returned", "missing", "request_only"];
  return statuses.map((status) => `
    <div class="print-legend-row">
      <svg class="legend-chip" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="1.5" fill="${statusColors[status]}" stroke="#2b3942" stroke-opacity="0.42" stroke-width="1.2"></rect>
      </svg>
      <strong>${escapeHtml(statusLabel(status))}</strong>
    </div>
  `).join("");
}

function statLine(label, value) {
  return `<div class="print-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function selectedMetricLines(stats, budget, rank, selectedKeys) {
  const metrics = {
    completionRate: ["Completion rate", stats.completionRate],
    open: ["Open active parcels", formatNumber(stats.open)],
    returned: ["Survey evidence returned", formatNumber(stats.returned)],
    active: ["Active assigned parcels", formatNumber(stats.active)],
    annualRunRate: budget ? ["Annual budget plan", formatMoney(budget.annualRunRate)] : null,
    monthlyRunRate: budget ? ["Monthly budget spend", formatMoney(budget.monthlyRunRate)] : null,
    assigned: ["Total assigned parcels", formatNumber(stats.assigned)],
    requestOnly: ["Request-only parcels", formatNumber(stats.requestOnly)],
    acres: ["Selected acres", formatAcres(stats.acres)],
    neighborhoods: ["Neighborhoods covered", formatNumber(stats.neighborhoods)],
    rank: rank ? ["Contractor open-work rank", `#${rank}`] : null
  };
  return selectedKeys.map((key) => metrics[key]).filter(Boolean).map(([label, value]) => statLine(label, value)).join("");
}

function buildPreparingPrintHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Preparing map export</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f8fb; color: #111820; font-family: Manrope, Segoe UI, Arial, sans-serif; }
      .loader { width: min(420px, calc(100vw - 40px)); border: 1px solid #cfe0e9; background: #fff; padding: 22px; box-shadow: 0 16px 40px rgba(0, 51, 79, .10); }
      .eyebrow { color: #0071a8; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
      h1 { margin: 8px 0 10px; color: #00334f; font-size: 21px; line-height: 1.15; }
      p { margin: 0 0 18px; color: #586872; font-size: 13px; line-height: 1.45; }
      .track { height: 9px; overflow: hidden; background: #e8eff4; border: 1px solid #d4e2ea; }
      .bar { width: 8%; height: 100%; background: #0098d3; transition: width .35s ease; }
      .step { margin-top: 10px; color: #00334f; font-size: 12px; font-weight: 800; }
    </style>
  </head>
  <body>
    <main class="loader">
      <span class="eyebrow">Export PDF</span>
      <h1>Preparing map export</h1>
      <p>The selected parcels are being zoomed, rendered, and captured for the print layout.</p>
      <div class="track" aria-label="Export progress"><div class="bar" id="progressBar"></div></div>
      <div class="step" id="progressStep">Starting export...</div>
    </main>
  </body>
</html>`;
}

function updatePrintProgress(printWindow, percent, label) {
  const doc = printWindow?.document;
  if (!doc) return;
  const bar = doc.getElementById("progressBar");
  const step = doc.getElementById("progressStep");
  if (bar) bar.style.width = `${Math.max(8, Math.min(100, percent))}%`;
  if (step) step.textContent = label;
}

function buildPrintHtml(mapImage, stats, screenshotScale, selectedMetricKeys = DEFAULT_EXPORT_METRICS) {
  const contractor = state.contractorFilter === "all" ? "All Contractors" : shortContractor(state.contractorFilter);
  const district = state.districtFilter === "all" ? "All Districts" : `Council District ${state.districtFilter}`;
  const ownership = ownershipLabel(state.ownershipFilter);
  const month = state.dataView === "current" ? "Current portfolio" : state.selectedMonth;
  const budget = exportBudgetStats();
  const rank = contractorOpenRank();
  const action = state.contractorFilter === "all"
    ? `Review ${formatNumber(stats.open)} open active parcels before monthly close.`
    : `Review ${formatNumber(stats.open)} open active parcels for ${contractor} before monthly close.`;
  const generated = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const filename = `landcare-survey-map-${slug(contractor)}-${slug(month)}.pdf`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(filename)}</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap");
      @page { size: A3 landscape; margin: 10mm; }
      * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      body { margin: 0; background: #e8eef2; color: #111820; font-family: Manrope, Segoe UI, Arial, sans-serif; }
      .sheet { width: 400mm; height: 277mm; margin: 0 auto; background: #fff; border: 1px solid #b9c9d4; display: grid; grid-template-rows: 27mm 1fr 12mm; }
      header { display: grid; grid-template-columns: 1fr auto; gap: 10mm; align-items: center; padding: 8mm 10mm 5mm; border-bottom: 1px solid #d8e4ea; }
      h1 { margin: 0; color: #00334f; font-size: 19pt; line-height: 1.05; }
      .subtitle { margin-top: 2mm; color: #586872; font-size: 9pt; font-weight: 700; }
      .brand { color: #0098d3; font-size: 18pt; font-weight: 800; letter-spacing: .02em; }
      main { display: grid; grid-template-columns: 1fr 82mm; gap: 6mm; padding: 6mm 8mm; min-height: 0; }
      .map-frame { position: relative; border: 1px solid #b9c9d4; background: #eef4f7; overflow: hidden; }
      .map-frame img { width: 100%; height: 100%; object-fit: contain; display: block; background: #eef4f7; }
      .north { position: absolute; left: 8mm; bottom: 11mm; display: grid; place-items: center; color: #00334f; font-weight: 800; font-size: 18pt; }
      .north::before { content: ""; width: 0; height: 0; border-left: 7mm solid transparent; border-right: 7mm solid transparent; border-bottom: 21mm solid #00334f; display: block; margin-bottom: 1mm; }
      .scale { position: absolute; right: 8mm; bottom: 8mm; min-width: 46mm; color: #111820; font-size: 7pt; font-weight: 800; }
      .scale-bar { height: 4mm; border-left: 1px solid #111820; border-right: 1px solid #111820; border-bottom: 3mm solid #111820; background: #fff; margin-bottom: 1mm; }
      aside { display: grid; grid-template-rows: auto auto 1fr; gap: 4mm; min-width: 0; }
      .box { border: 1px solid #d8e4ea; padding: 5mm; background: #f7fbfd; }
      .box.metrics { border-top: 4px solid #0098d3; background: #fff; }
      .box h2 { margin: 0 0 3mm; color: #00334f; font-size: 10pt; text-transform: uppercase; letter-spacing: .04em; }
      .print-stat { display: grid; grid-template-columns: 1fr auto; gap: 5mm; padding: 2.3mm 0; border-bottom: 1px solid #d8e4ea; font-size: 8pt; }
      .print-stat:last-child { border-bottom: 0; }
      .print-stat span { color: #586872; font-weight: 700; }
      .print-stat strong { color: #111820; font-size: 10pt; }
      .print-legend-row { display: grid; grid-template-columns: 6mm 1fr; gap: 3mm; align-items: center; margin: 3mm 0; font-size: 8pt; }
      .print-legend-row span { width: 6mm; height: 6mm; border: 1px solid rgba(17,24,32,.32); display: inline-block; }
      .legend-chip { width: 6mm; height: 6mm; display: block; }
      .boundary { width: 18mm; height: 0; border-top: 1.4px solid #9a7419; display: inline-block; vertical-align: middle; margin-right: 3mm; }
      .action { color: #111820; font-size: 9pt; line-height: 1.45; font-weight: 700; }
      footer { display: flex; align-items: center; justify-content: space-between; padding: 0 10mm; color: #586872; font-size: 7.5pt; border-top: 1px solid #d8e4ea; }
      @media print { body { background: #fff; } .sheet { margin: 0; } }
    </style>
  </head>
  <body>
    <section class="sheet">
      <header>
        <div>
          <h1>URA LandCare Executive Map Brief</h1>
          <div class="subtitle">Survey Month: ${escapeHtml(month)} &nbsp;|&nbsp; Ownership: ${escapeHtml(ownership)} &nbsp;|&nbsp; Contractor: ${escapeHtml(contractor)} &nbsp;|&nbsp; ${escapeHtml(district)}</div>
        </div>
        <div class="brand">URA</div>
      </header>
      <main>
        <div class="map-frame">
          <img src="${mapImage}" alt="LandCare survey map">
          <div class="north">N</div>
          <div class="scale"><div class="scale-bar"></div>Approx. scale 1:${formatNumber(Math.round(screenshotScale || state.view?.scale || 0))}</div>
        </div>
        <aside>
          <div class="box metrics">
            <h2>Executive metrics</h2>
            ${selectedMetricLines(stats, budget, rank, selectedMetricKeys)}
          </div>
          <div class="box">
            <h2>Legend</h2>
            ${printLegendHtml()}
            <div class="print-legend-row"><span class="boundary"></span><strong>Council district boundary</strong></div>
          </div>
          <div class="box">
            <h2>Action Focus</h2>
            <div class="action">${escapeHtml(action)}</div>
          </div>
        </aside>
      </main>
      <footer>
        <span>Generated: ${escapeHtml(generated)}</span>
        <span>Source: LandCare Assurance Dashboard</span>
      </footer>
    </section>
    <script>
      async function printWhenMapImageIsReady() {
        const image = document.querySelector(".map-frame img");
        if (image && image.decode) {
          await image.decode().catch(() => {});
        }
        setTimeout(() => window.print(), 650);
      }
      window.addEventListener("load", printWhenMapImageIsReady);
    </script>
  </body>
</html>`;
}

async function exportPrintPdf(selectedMetricKeys = DEFAULT_EXPORT_METRICS) {
  const button = document.getElementById("exportPdfButton");
  const status = document.getElementById("exportStatus");
  const priorLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Preparing PDF...";
  status.textContent = "";
  const printWindow = window.open("", "_blank");
  try {
    if (!printWindow) throw new Error("Popup blocked. Allow popups to open the print layout.");
    printWindow.document.open();
    printWindow.document.write(buildPreparingPrintHtml());
    printWindow.document.close();
    updatePrintProgress(printWindow, 18, "Using current map view...");
    updatePrintProgress(printWindow, 42, "Waiting for map layers to finish drawing...");
    await waitForMapRenderReady();
    updatePrintProgress(printWindow, 68, "Capturing high-resolution map image...");
    const screenshotScale = state.view.scale;
    const screenshot = await state.view.takeScreenshot({
      width: 2200,
      height: 1450,
      format: "png"
    });
    updatePrintProgress(printWindow, 86, "Building print layout...");
    const stats = exportStats(filteredFeatures());
    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(screenshot.dataUrl, stats, screenshotScale, selectedMetricKeys));
    printWindow.document.close();
    status.textContent = "Print layout opened. Choose Save as PDF in the print dialog.";
  } catch (error) {
    console.error(error);
    status.textContent = "PDF export failed. Try again after the map finishes loading.";
  } finally {
    button.disabled = false;
    button.textContent = priorLabel;
  }
}

function alignHistoryToCurrentArcgisGeometries(historyGeojson, currentDataset) {
  const currentByDigits = new globalThis.Map();
  for (const feature of currentDataset?.geojson?.features || []) {
    const key = feature.properties.parcel_digits || parcelDigits(feature.properties.parcel_key);
    if (!key || !feature.geometry || currentByDigits.has(key)) continue;
    currentByDigits.set(key, feature);
  }
  if (!currentByDigits.size) return historyGeojson;
  const features = [];
  for (const feature of historyGeojson.features || []) {
    const currentFeature = currentByDigits.get(parcelDigits(feature.properties?.parcel_key));
    if (!currentFeature) {
      features.push(feature);
      continue;
    }
    features.push({
      ...feature,
      geometry: currentFeature.geometry,
      properties: {
        ...feature.properties,
        parcel_key: currentFeature.properties.parcel_key || feature.properties.parcel_key,
        parcel_digits: currentFeature.properties.parcel_digits,
        parcel_number: currentFeature.properties.parcel_number,
        block_lot: currentFeature.properties.block_lot || feature.properties.block_lot,
        ownership_group: currentFeature.properties.ownership_group || feature.properties.ownership_group,
        inventory_type: currentFeature.properties.inventory_type || feature.properties.inventory_type,
        current_status: currentFeature.properties.current_status,
        property_class: currentFeature.properties.property_class,
        project_name: currentFeature.properties.project_name,
        tags: currentFeature.properties.tags,
        council_district: currentFeature.properties.council_district,
        neighborhood: currentFeature.properties.neighborhood,
        geometry_source: "ArcGIS current LandCare parcel geometry"
      }
    });
  }
  return {
    ...historyGeojson,
    metadata: {
      ...(historyGeojson.metadata || {}),
      current_landcare_filter: "Monthly survey status aligned at runtime to live ArcGIS LandCare parcel geometries.",
      source_feature_count: historyGeojson.features?.length || 0,
      eligible_feature_count: features.length
    },
    features
  };
}

async function loadData() {
  const [historySummary, staticHistoryGeojson, currentDatasetResult, financeSummary, surveyMetadata, surveyPeriodStats, assignmentCurrentMetadata, assignmentHistoryMetadata, assignmentPeriodStats, assignmentHistoryResult] =
    await Promise.all([
      fetch(`${DATA_ROOT}/latest_month_summary.json`).then((response) => response.json()),
      fetch(`${DATA_ROOT}/all_months.geojson`).then((response) => response.json()),
      loadCurrentArcgisDataset().then(
        (dataset) => ({ dataset }),
        (error) => ({ error })
      ),
      fetch(`${DATA_ROOT}/finance_summary.json`).then((response) => response.json()),
      fetchSurveyLayerMetadata().catch(() => null),
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

  state.surveyLayerInfo = surveyMetadata;
  state.surveyPeriodStats = surveyPeriodStats;
  state.assignmentLayerInfo = {
    current: assignmentCurrentMetadata,
    history: assignmentHistoryMetadata,
    source_error: assignmentHistoryResult.error?.message || null
  };
  state.assignmentPeriodStats = assignmentPeriodStats;
  const withSurveySummary = enrichSummaryWithSurveyLayer(historySummary, surveyMetadata, surveyPeriodStats);
  const enrichedSummary = enrichSummaryWithAssignmentLayers(
    withSurveySummary,
    assignmentCurrentMetadata,
    assignmentHistoryMetadata,
    assignmentPeriodStats
  );
  const liveAssignmentGeojson = assignmentHistoryResult.geojson;
  const baseHistoryGeojson = liveAssignmentGeojson || staticHistoryGeojson;
  const evidenceByPeriod = await loadCombinedEvidenceByPeriod(
    enrichedSummary.available_months,
    baseHistoryGeojson.features
  ).catch(() => ({}));
  state.survey123EvidenceByPeriod = await loadSurvey123EvidenceByPeriod(
    enrichedSummary.available_months,
    baseHistoryGeojson.features
  ).catch(() => ({}));
  const mergedHistoryGeojson = mergeSurveyEvidenceIntoGeojson(baseHistoryGeojson, evidenceByPeriod);
  mergedHistoryGeojson.metadata = {
    ...(mergedHistoryGeojson.metadata || {}),
    assignment_source: liveAssignmentGeojson ? ASSIGNMENT_HISTORY_LAYER_NAME : "published_assignment_geojson_fallback",
    assignment_layer_url: liveAssignmentGeojson ? ASSIGNMENT_HISTORY_LAYER_URL.replace(/\/0$/, "") : null,
    assignment_layer_item_url: liveAssignmentGeojson ? ASSIGNMENT_HISTORY_AGOL_ITEM_URL : null,
    assignment_source_error: assignmentHistoryResult.error?.message || null
  };

  const rawCurrentDataset = currentDatasetResult.dataset || buildCurrentFallbackDataset(enrichedSummary, mergedHistoryGeojson);
  const currentPeriod = enrichedSummary.latest_month;
  const currentGeojsonWithPeriod = {
    ...rawCurrentDataset.geojson,
    features: (rawCurrentDataset.geojson.features || []).map((feature) => ({
      ...feature,
      properties: { ...feature.properties, period_month: currentPeriod }
    }))
  };
  const currentDataset = {
    ...rawCurrentDataset,
    geojson: mergeSurveyEvidenceIntoGeojson(currentGeojsonWithPeriod, evidenceByPeriod)
  };
  state.currentDataWarning = currentDatasetResult.error ? "live ArcGIS fallback" : "";
  if (currentDatasetResult.error) {
    console.warn("Live ArcGIS current inventory unavailable; using latest published dashboard data.", currentDatasetResult.error);
  }
  state.datasets = {
    history: {
      summary: enrichedSummary,
      geojson: currentDatasetResult.dataset
        ? alignHistoryToCurrentArcgisGeometries(mergedHistoryGeojson, currentDataset)
        : mergedHistoryGeojson
    },
    current: currentDataset
  };
  state.finance = financeSummary;
  state.selectedMonth = enrichedSummary.latest_month;
  setActiveDataset();
  await ensureSurveyRecords();
}


async function loadCurrentArcgisDataset() {
  const [layerInfo, surveyInfo, result] = await Promise.all([
    fetchArcgisJson(EPP_LAYER_URL, { f: "json" }),
    fetchSurveyLayerMetadata(),
    fetchArcgisJson(`${EPP_LAYER_URL}/query`, {
      f: "json",
      where: CURRENT_WHERE,
      outFields: CURRENT_OUT_FIELDS,
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "2000",
      orderByFields: "property_maint_mgr_name ASC, parcel_number ASC"
    })
  ]);
  const features = (result.features || []).map((feature) => ({
    type: "Feature",
    geometry: esriPolygonToGeoJson(feature.geometry),
    properties: normalizeCurrentAttributes(feature.attributes || {})
  }));
  return summarizeCurrentDataset(features, {
    sourceKind: "live_arcgis",
    generatedOn: "live",
    eppLayerEdited: dateFromMillis(layerInfo.editingInfo?.dataLastEditDate),
    surveyLayerEdited: surveyInfo?.dataLastEdit,
    eppRecordCount: layerInfo.recordCount,
    surveyRecordCount: surveyInfo?.recordCount
  });
}

function buildCurrentFallbackDataset(historySummary, historyGeojson) {
  const latestMonth = historySummary.latest_month;
  const features = (historyGeojson.features || [])
    .filter((feature) => feature.properties?.period_month === latestMonth)
    .map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        parcel_digits: feature.properties?.parcel_digits || parcelDigits(feature.properties?.parcel_key),
        source_layer: feature.properties?.source_layer || "published_monthly_assurance_geojson"
      }
    }));
  return summarizeCurrentDataset(features, {
    sourceKind: "published_latest_month_fallback",
    generatedOn: historySummary.generated_on || historySummary.latest_updated || "published",
    eppLayerEdited: null,
    surveyLayerEdited: null,
    eppRecordCount: null,
    surveyRecordCount: null
  });
}

function summarizeCurrentDataset(features, options) {
  const parcelKeys = new Set();
  const levelCounts = {};
  const statusCounts = {};
  const contractorCounts = {};
  const neighborhoods = new Set();
  for (const feature of features) {
    const props = feature.properties;
    if (props.parcel_key) parcelKeys.add(props.parcel_key);
    if (props.neighborhood) neighborhoods.add(props.neighborhood);
    levelCounts[props.maintenance_level] = (levelCounts[props.maintenance_level] || 0) + 1;
    statusCounts[props.completion_status] = (statusCounts[props.completion_status] || 0) + 1;
    contractorCounts[props.organization] = (contractorCounts[props.organization] || 0) + 1;
  }
  const sourceNote = options.sourceKind === "live_arcgis"
    ? "Current URA-owned LandCare parcel inventory."
    : "Published latest-month LandCare assurance data used when live ArcGIS current inventory is unavailable.";
  return {
    summary: {
      generated_on: options.generatedOn,
      view: "current_arcgis_universe",
      view_source: options.sourceKind,
      source_note: sourceNote,
      source_layer: "gisdb_gis_epp_parcels_full",
      source_layer_url: EPP_LAYER_URL.replace(/\/0$/, ""),
      survey_layer: SURVEY_LAYER_NAME,
      survey_layer_url: SURVEY_LAYER_URL.replace(/\/0$/, ""),
      survey_layer_item_url: SURVEY_AGOL_ITEM_URL,
       ownership_scope: "URA and PLB owned",
      feature_count: features.length,
      unique_parcel_count: parcelKeys.size,
      duplicate_parcel_key_count: features.length - parcelKeys.size,
      active_count: levelCounts.Active || 0,
      request_only_count: levelCounts["Request Only"] || 0,
      contractor_count: Object.keys(contractorCounts).length,
      neighborhood_count: neighborhoods.size,
      level_counts: levelCounts,
      status_counts: statusCounts,
      contractor_counts: contractorCounts,
      epp_layer: {
        data_last_edit: options.eppLayerEdited,
        record_count: options.eppRecordCount,
        service_url: EPP_LAYER_URL.replace(/\/0$/, "")
      },
      survey_layer_summary: {
        data_last_edit: options.surveyLayerEdited,
        record_count: options.surveyRecordCount,
        service_url: SURVEY_LAYER_URL.replace(/\/0$/, ""),
        item_url: SURVEY_AGOL_ITEM_URL
      }
    },
    geojson: {
      type: "FeatureCollection",
      metadata: {},
      features
    }
  };
}

function buildHistoryAssignmentLayer({ url, title, mode, visible }) {
  return new GeoJSONLayer({
    url,
    title,
    outFields: ["*"],
    visible,
    definitionExpression: assignmentHistoryWhereForFilter(mode),
    renderer: statusRenderer(mode),
    opacity: 0.88,
    labelingInfo: [{
      labelExpressionInfo: { expression: "IIf(!IsEmpty($feature.block_lot), $feature.block_lot, DefaultValue($feature.parcel_number, $feature.parcel_key))" },
      minScale: 2500,
      symbol: {
        type: "text",
        color: "#17212b",
        haloColor: "#ffffff",
        haloSize: 1.35,
        font: { family: "Arial", size: 9, weight: "bold" }
      }
    }],
    popupTemplate: {
      title: "{organization}",
      content: `
        <b>Parcel:</b> {parcel_key}<br>
        <b>Status:</b> {completion_status}<br>
        <b>Survey month:</b> {period_month}<br>
        <b>Maintenance level:</b> {maintenance_level}<br>
        <b>Ownership:</b> {ownership_type}
      `
    }
  });
}

function buildHistoryLayer({ url, title, mode, visible }) {
  return buildHistoryAssignmentLayer({ url, title, mode, visible });
}

function buildCurrentLayer({ visible }) {
  const currentUrl = URL.createObjectURL(new Blob(
    [JSON.stringify(state.datasets.current.geojson)],
    { type: "application/geo+json" }
  ));
  return buildHistoryLayer({
    url: currentUrl,
    title: "Current LandCare Parcels",
    mode: "current",
    visible
  });
}

function buildCartoLightBasemap() {
  const baseLayer = new WebTileLayer({
    urlTemplate: "https://{subDomain}.basemaps.cartocdn.com/light_all/{level}/{col}/{row}.png",
    subDomains: ["a", "b", "c", "d"],
    copyright: CARTO_LIGHT_ATTRIBUTION,
    title: "Carto Light"
  });
  return new Basemap({
    baseLayers: [baseLayer],
    title: "Carto Light",
    id: "carto-light"
  });
}

async function initMap() {
  const historyUrl = URL.createObjectURL(new Blob(
    [JSON.stringify(state.datasets.history.geojson)],
    { type: "application/geo+json" }
  ));
  const historyAssignmentLayer = buildHistoryAssignmentLayer({
    url: historyUrl,
    title: "LandCare Open Assignments",
    mode: "history",
    visible: state.dataView === "history"
  });
  const currentLayer = buildCurrentLayer({
    visible: state.dataView === "current"
  });
  state.layers = {
    historyAssignments: historyAssignmentLayer,
    current: currentLayer
  };
  const neighborhoodLayer = new FeatureLayer({
    url: "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebNeighborhoods/FeatureServer/0",
    title: "City Neighborhoods",
    opacity: 0.12,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [0, 152, 211, 0.025],
        outline: { color: [0, 108, 159, 0.32], width: 0.55 }
      }
    },
    popupEnabled: false
  });

  const councilLayer = new FeatureLayer({
    url: COUNCIL_DISTRICT_LAYER_URL,
    title: "Council Districts",
    opacity: 1,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [240, 194, 75, 0.015],
        outline: { color: [124, 86, 8, 0.42], width: 0.7 }
      }
    },
    labelingInfo: [
      {
        symbol: {
          type: "text",
          color: [78, 55, 7, 0.95],
          haloColor: [255, 255, 255, 0.85],
          haloSize: 1.2,
          font: { family: "Inter", size: 11, weight: "bold" }
        },
        labelExpressionInfo: { expression: "'D' + Text($feature.DIST_ID)" },
        minScale: 120000
      }
    ],
    popupEnabled: false
  });

  const councilHighlightLayer = new FeatureLayer({
    url: COUNCIL_DISTRICT_LAYER_URL,
    title: "Selected Council District",
    definitionExpression: state.districtFilter === "all" ? "1=0" : `DIST_ID = ${Number(state.districtFilter)}`,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [240, 194, 75, 0.08],
        outline: { color: [0, 108, 159, 0.82], width: 1.6 }
      }
    },
    popupEnabled: false
  });
  state.boundaryLayers.council = councilLayer;
  state.boundaryLayers.councilHighlight = councilHighlightLayer;

  const map = new Map({
    basemap: buildCartoLightBasemap(),
    layers: [neighborhoodLayer, councilLayer, councilHighlightLayer, historyAssignmentLayer, currentLayer]
  });

  const view = new MapView({
    container: "mapView",
    map,
    center: [-79.9959, 40.4406],
    zoom: 13,
    ui: { components: ["attribution"] },
    constraints: { minZoom: 11 },
    popup: {
      dockEnabled: false
    }
  });

  state.view = view;
  view.ui.add(new Home({ view }), "top-left");
  view.ui.add(new Search({ view, includeDefaultSources: true }), "top-right");
  view.ui.add(new Zoom({ view }), "bottom-right");
  view.ui.add(new BasemapToggle({ view, nextBasemap: "satellite" }), "bottom-right");

  view.on("click", async (event) => {
    const hit = await view.hitTest(event);
    const historyLayerSet = new Set(historyLayers());
    const graphic = hit.results.find((result) => {
      const layer = result.graphic?.layer;
      return layer === state.layers.current || historyLayerSet.has(layer);
    })?.graphic;
    if (!graphic?.attributes) return;
    const props = state.dataView === "current"
      ? normalizeCurrentAttributes(graphic.attributes)
      : graphic.attributes;
    setParcelDetail(props);
    const enriched = await enrichWithSurveyEvidence(props);
    setParcelDetail(enriched);
  });

  let hoverTimer = null;
  let lastHoverKey = "";
  const hoverCard = document.getElementById("evidenceHoverCard");
  const hideHoverCard = () => {
    lastHoverKey = "";
    hoverCard.hidden = true;
    hoverCard.replaceChildren();
  };
  view.on("pointer-leave", hideHoverCard);
  view.on("pointer-move", (event) => {
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(async () => {
      const hit = await view.hitTest(event).catch(() => null);
      const graphic = hit?.results?.find((result) => {
        const layer = result.graphic?.layer;
        return layer === state.layers.current || layer === state.layers.historyAssignments;
      })?.graphic;
      const props = graphic?.attributes;
      const normalised = graphic?.layer === state.layers.current ? normalizeCurrentAttributes(props) : props;
      const evidence = await enrichWithSurveyEvidence(normalised || {});
      const imageUrl = safeImageUrl(evidence?.image_url);
      const key = `${evidence?.OBJECTID || normalised?.parcel_key || ""}:${imageUrl}`;
      if (!imageUrl || key === lastHoverKey) {
        if (!imageUrl) hideHoverCard();
        return;
      }
      lastHoverKey = key;
      hoverCard.innerHTML = surveyPhotoMarkup(evidence, { compact: true });
      bindPhotoFallbacks(hoverCard);
      hoverCard.hidden = false;
      hoverCard.style.left = `${Math.min(event.x + 14, Math.max(12, view.width - 238))}px`;
      hoverCard.style.top = `${Math.min(event.y + 14, Math.max(12, view.height - 212))}px`;
    }, 180);
  });

  await view.when();
  await Promise.all([
    historyAssignmentLayer.when(),
    currentLayer.when()
  ].filter(Boolean));
  await zoomToDefaultCurrent();
}

async function main() {
  wireControls();
  await loadData();
  renderAll();
  await initMap();
}

main().catch((error) => {
  console.error(error);
  const message = error?.message ? `Monitoring map failed: ${error.message}` : "Monitoring map failed to initialize.";
  document.getElementById("mapBadge").textContent = message;
});
