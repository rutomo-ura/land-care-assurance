import Map from "https://js.arcgis.com/4.30/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js";
import GeoJSONLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/GeoJSONLayer.js";
import FeatureLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/FeatureLayer.js";
import Home from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Home.js";
import Search from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Search.js";
import BasemapToggle from "https://js.arcgis.com/4.30/@arcgis/core/widgets/BasemapToggle.js";

const DATA_ROOT = "../landcare/data";
const EPP_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_epp_parcels_full/FeatureServer/0";
const SURVEY_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_surveys/FeatureServer/0";
const COUNCIL_DISTRICT_LAYER_URL =
  "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/CouncilDistricts2022/FeatureServer/0";
const CURRENT_WHERE = "tags LIKE '%LandCare%' AND inventory_type = 'URA Owned'";
const CURRENT_OUT_FIELDS = [
  "OBJECTID",
  "parcel_number",
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
  ownership_risk: "#c2410c"
};

const contractorPalette = [
  "#0098d3",
  "#006c9f",
  "#008f9f",
  "#554a8f",
  "#e65100",
  "#2e7d32",
  "#7b1fa2",
  "#455a64",
  "#ad1457",
  "#f0c24b"
];

const state = {
  summary: null,
  geojson: null,
  datasets: null,
  view: null,
  layers: {},
  boundaryLayers: {},
  contractorFilter: "all",
  districtFilter: "all",
  colorMode: "status",
  selectedMonth: null,
  dataView: "history",
  mapFocusLabel: ""
};

const formatter = new Intl.NumberFormat("en-US");

function formatNumber(value) {
  return formatter.format(Number(value || 0));
}

function pct(numerator, denominator) {
  return denominator ? `${((100 * numerator) / denominator).toFixed(1)}%` : "0.0%";
}

function slug(value) {
  return String(value || "all")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "all";
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
      color: contractorPalette[index % contractorPalette.length]
    }));
}

function contractorColor(name) {
  return contractorItems().find((item) => item.name === name)?.color || "#8a8f98";
}

function districtItems() {
  const counts = {};
  const features = state.datasets?.current?.geojson?.features || [];
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

function dateFromMillis(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function stripPrimaryContact(value) {
  return String(value || "Unassigned").replace(/\s+Primary Contact$/i, "") || "Unassigned";
}

function currentMaintenanceLevel(tags) {
  const text = String(tags || "");
  if (text.includes("LandCare - Request Only")) return "Request Only";
  if (text.includes("LandCare - Active")) return "Active";
  return "LandCare";
}

function normalizeCurrentAttributes(attrs) {
  const maintenanceLevel = currentMaintenanceLevel(attrs.tags);
  const parcelKey = attrs.parcel_number || attrs.property_id || `EPP-${attrs.OBJECTID}`;
  return {
    objectid: attrs.OBJECTID,
    parcel_key: parcelKey,
    parcel_number: attrs.parcel_number,
    property_id: attrs.property_id,
    period_month: "Current",
    organization: stripPrimaryContact(attrs.property_maint_mgr_name),
    organization_contact: attrs.property_maint_mgr_name || "Unassigned",
    maintenance_level: maintenanceLevel,
    completion_status: maintenanceLevel === "Request Only" ? "request_only" : "current_active",
    returned_flag: false,
    ownership_type: "URA",
    inventory_type: attrs.inventory_type,
    current_status: attrs.current_status,
    census_tract: attrs.census_tract,
    council_district: attrs.council_district,
    neighborhood: attrs.neighborhood,
    project_name: attrs.project_name,
    property_class: attrs.property_class,
    acreage: attrs.par_calcacreag,
    zoning: attrs.zoned_as,
    parcel_sqft: attrs.parcel_sqft,
    tags: attrs.tags,
    mod_dt: dateFromMillis(attrs.mod_dt),
    source_layer: "gisdb_gis_epp_parcels_full"
  };
}

function currentMonthFeatures() {
  const features = state.geojson?.features || [];
  if (state.dataView === "current") return features;
  return features.filter((feature) => feature.properties.period_month === state.selectedMonth);
}

function districtFilteredFeatures() {
  const features = currentMonthFeatures();
  if (state.dataView !== "current" || state.districtFilter === "all") return features;
  return features.filter((feature) => String(feature.properties.council_district || "") === state.districtFilter);
}

function filteredFeatures() {
  const features = districtFilteredFeatures();
  if (state.contractorFilter === "all") return features;
  return features.filter((feature) => feature.properties.organization === state.contractorFilter);
}

function uniqueCount(features, predicate = () => true) {
  return new Set(
    features
      .filter(predicate)
      .map((feature) => feature.properties.parcel_key)
      .filter(Boolean)
  ).size;
}

function fillSymbol(color, outline = "#ffffff") {
  return {
    type: "simple-fill",
    color: `${color}bd`,
    outline: { color: outline, width: 0.65 }
  };
}

function statusRenderer(mode = state.dataView) {
  if (mode === "current") {
    return {
      type: "unique-value",
      valueExpression: "IIF(Find('LandCare - Request Only', $feature.tags) > -1, 'request_only', 'current_active')",
      defaultSymbol: fillSymbol("#8a8f98"),
      uniqueValueInfos: ["current_active", "request_only"].map((value) => ({
        value,
        label: statusLabel(value),
        symbol: fillSymbol(statusColors[value])
      }))
    };
  }
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
  if (mode === "current") {
    return {
      type: "unique-value",
      valueExpression:
        "When(IsEmpty($feature.property_maint_mgr_name), 'Unassigned', Replace($feature.property_maint_mgr_name, ' Primary Contact', ''))",
      defaultSymbol: fillSymbol("#8a8f98"),
      uniqueValueInfos: contractorItems().map((item) => ({
        value: item.name,
        label: item.label,
        symbol: fillSymbol(item.color)
      }))
    };
  }
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

function whereForFilter(mode = state.dataView) {
  const clauses = [];
  if (mode === "current") {
    clauses.push(CURRENT_WHERE);
    if (state.districtFilter !== "all") {
      clauses.push(`council_district = ${sqlValue(state.districtFilter)}`);
    }
  }
  if (mode === "history") {
    const month = String(state.selectedMonth || state.datasets.history.summary.latest_month).replace(/'/g, "''");
    clauses.push(`period_month = '${month}'`);
  }
  if (state.contractorFilter !== "all") {
    if (mode === "current") {
      const contactClause = contractorContactClause(state.contractorFilter);
      if (contactClause) clauses.push(contactClause);
    } else {
      clauses.push(`organization = ${sqlValue(state.contractorFilter)}`);
    }
  }
  return clauses.length ? clauses.join(" AND ") : "1=1";
}

function availableMonths() {
  const history = state.datasets?.history;
  return history?.summary.available_months || [
    ...new Set((history?.geojson?.features || []).map((feature) => feature.properties.period_month))
  ].sort();
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
  const active = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Active");
  const returned = uniqueCount(features, (feature) => feature.properties.returned_flag);
  const open = uniqueCount(features, (feature) => feature.properties.completion_status === "missing");
  const assigned = uniqueCount(features);
  if (state.dataView === "current") {
    const requestOnly = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Request Only");
    const contractors = new Set(features.map((feature) => feature.properties.organization).filter(Boolean)).size;
    document.getElementById("latestMonthLabel").textContent = "Current URA-owned LandCare parcels";
    document.getElementById("assignedKpiLabel").textContent = "Parcels";
    document.getElementById("returnedKpiLabel").textContent = "Active";
    document.getElementById("completionKpiLabel").textContent = "Request Only";
    document.getElementById("openKpiLabel").textContent = "Contractors";
    document.getElementById("assignedKpi").textContent = formatNumber(assigned);
    document.getElementById("returnedKpi").textContent = formatNumber(active);
    document.getElementById("completionKpi").textContent = formatNumber(requestOnly);
    document.getElementById("openKpi").textContent = formatNumber(contractors);
    return;
  }
  document.getElementById("latestMonthLabel").textContent = `${state.selectedMonth} URA-owned survey month`;
  document.getElementById("assignedKpiLabel").textContent = "Assigned";
  document.getElementById("returnedKpiLabel").textContent = "Returned";
  document.getElementById("completionKpiLabel").textContent = "Completion";
  document.getElementById("openKpiLabel").textContent = "Open";
  document.getElementById("assignedKpi").textContent = formatNumber(assigned);
  document.getElementById("returnedKpi").textContent = formatNumber(returned);
  document.getElementById("completionKpi").textContent = pct(returned, active);
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
      : ["returned", "missing", "request_only", "ownership_risk"];
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
    state.dataView === "current" ? "LandCare Status" : "Survey Status";
  if (state.colorMode === "contractor") {
    heading.textContent = "Legend - Contractor";
    list.innerHTML = contractorItems().map((item) => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${item.color}"></span>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${formatNumber(item.count)}</span>
      </div>
    `).join("");
    return;
  }

  heading.textContent = state.dataView === "current" ? "Legend - LandCare Status" : "Legend - Survey Status";
  const counts = filteredFeatures().reduce((acc, feature) => {
    const status = feature.properties.completion_status || "missing";
    const parcelKey = feature.properties.parcel_key;
    if (!parcelKey) return acc;
    acc[status] ||= new Set();
    acc[status].add(parcelKey);
    return acc;
  }, {});
  list.innerHTML = Object.entries(statusColors)
    .filter(([status]) => {
      if (counts[status]?.size) return true;
      return state.dataView === "history" && ["returned", "missing", "request_only"].includes(status);
    })
    .map(([status, color]) => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${color}"></span>
        <strong>${statusLabel(status)}</strong>
        <span>${formatNumber(counts[status]?.size || 0)}</span>
      </div>
    `).join("");
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
  const returned = uniqueCount(features, (feature) => feature.properties.returned_flag);
  const requestOnly = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Request Only");
  const directive = focusRow
    ? state.contractorFilter === "all"
      ? `Start with ${shortContractor(focusRow.organization)}: ${formatNumber(focusRow.open)} open active parcels in ${state.selectedMonth}, ${pct(focusRow.returned, focusRow.assigned)} complete versus ${overallRate.toFixed(1)}% overall.`
      : `${shortContractor(focusRow.organization)} has ${formatNumber(focusRow.open)} open active parcels in ${state.selectedMonth}; review missing survey evidence before monthly close.`
    : `No contractor issue detected for ${state.selectedMonth}.`;
  document.getElementById("actionFocus").innerHTML = `
    <div class="action-directive"><strong>Action</strong><span>${escapeHtml(directive)}</span></div>
    <div><strong>${formatNumber(activeOpen)}</strong><span>Open active parcels in current filter</span></div>
    <div><strong>${formatNumber(returned)}</strong><span>Returned surveys matched to URA-owned parcels</span></div>
    <div><strong>${formatNumber(requestOnly)}</strong><span>Request-only assignments excluded from active compliance</span></div>
  `;
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
  document.getElementById("freshnessNote").textContent = "Current LandCare universe";
  if (state.dataView === "current") {
    const visibleFeatures = filteredFeatures();
    const districtText = state.districtFilter === "all" ? "all council districts" : `Council District ${state.districtFilter}`;
    const contractorText =
      state.contractorFilter === "all" ? "all contractors" : shortContractor(state.contractorFilter);
    document.getElementById("mapBadge").textContent =
      `${formatNumber(visibleFeatures.length)} records / ${formatNumber(uniqueCount(visibleFeatures))} parcels`;
    document.getElementById("mapCallout").innerHTML = `
      <strong>Current URA-owned LandCare universe</strong>
      <span>${escapeHtml(districtText)} - ${escapeHtml(contractorText)}${state.mapFocusLabel ? ` - ${escapeHtml(state.mapFocusLabel)}` : ""}</span>
    `;
    return;
  }
  document.getElementById("mapBadge").textContent =
    `${formatNumber(currentMonthFeatures().length)} parcels - ${state.selectedMonth} - ${formatNumber(state.summary.all_month_feature_count || state.geojson.features.length)} records total`;
  document.getElementById("mapCallout").innerHTML = `
    <strong>URA-owned ${state.selectedMonth} LandCare parcels</strong>
    <span>Colored by ${state.colorMode === "contractor" ? "contractor" : "survey status"}; current contractor filter: ${state.contractorFilter === "all" ? "all" : escapeHtml(shortContractor(state.contractorFilter))}.</span>
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
      Property class: ${escapeHtml(props.property_class || "Unknown")}<br>
      Zoning: ${escapeHtml(props.zoning || "Unknown")}<br>
      Area: ${formatNumber(props.parcel_sqft)} sq ft${props.acreage ? ` / ${Number(props.acreage).toFixed(2)} ac` : ""}<br>
      Tags: ${escapeHtml(props.tags || "None")}<br>
      Modified: ${escapeHtml(props.mod_dt || "Unknown")}
    `;
  }
  return `
    <strong>${escapeHtml(props.parcel_key)}</strong><br>
    Contractor: ${escapeHtml(props.organization)}<br>
    Survey month: ${escapeHtml(props.period_month)}<br>
    Maintenance level: ${escapeHtml(props.maintenance_level)}<br>
    Status: ${escapeHtml(statusLabel(props.completion_status))}<br>
    Ownership: ${escapeHtml(props.ownership_type || "Other or unknown")}<br>
    Owner: ${escapeHtml(props.owner_name || "Unknown")}<br>
    Source: Monthly assurance layer
  `;
}

function setParcelDetail(props) {
  document.getElementById("parcelDetail").innerHTML = parcelDetail(props);
}

function updateDistrictHighlight() {
  if (!state.boundaryLayers.councilHighlight) return;
  state.boundaryLayers.councilHighlight.definitionExpression =
    state.dataView === "current" && state.districtFilter !== "all"
      ? `DIST_ID = ${Number(state.districtFilter)}`
      : "1=0";
}

function currentZoomWhere({ contractor = state.contractorFilter, district = state.districtFilter, neighborhood = null } = {}) {
  const clauses = [CURRENT_WHERE];
  if (district && district !== "all") clauses.push(`council_district = ${sqlValue(district)}`);
  const contactClause = contractorContactClause(contractor);
  if (contactClause) clauses.push(contactClause);
  if (neighborhood) clauses.push(`neighborhood = ${sqlValue(neighborhood)}`);
  return clauses.join(" AND ");
}

async function zoomToCurrentWhere(where, { expand = 1.18, duration = 650 } = {}) {
  const layer = state.layers.current;
  if (!state.view || !layer?.queryExtent) return;
  const result = await layer.queryExtent({
    where,
    outSpatialReference: state.view.spatialReference
  }).catch(() => null);
  if (!result?.extent) return;
  await state.view.goTo(result.extent.expand(expand), { duration }).catch(() => {});
}

async function zoomToDefaultCurrent() {
  state.mapFocusLabel = "";
  if (!state.view) return;
  await state.view.goTo({ center: [-79.9959, 40.4406], zoom: 13 }, { duration: 650 }).catch(() => {});
}

async function zoomToDistrict(district = state.districtFilter) {
  if (district === "all") {
    await zoomToDefaultCurrent();
    return;
  }
  state.mapFocusLabel = `district focus`;
  await zoomToCurrentWhere(currentZoomWhere({ contractor: "all", district }), { expand: 1.12 });
}

async function zoomToActiveFilteredExtent({ expand = 1.16, duration = 650 } = {}) {
  const layer = activeLayer();
  if (!state.view || !layer?.queryExtent) return;
  const result = await layer.queryExtent({
    where: whereForFilter(),
    outSpatialReference: state.view.spatialReference
  }).catch(() => null);
  if (!result?.extent) return;
  await state.view.goTo(result.extent.expand(expand), { duration }).catch(() => {});
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
    await zoomToDistrict();
    return;
  }
  const neighborhood = dominantNeighborhoodForContractor(name);
  state.mapFocusLabel = neighborhood ? `largest cluster: ${neighborhood}` : "";
  await zoomToCurrentWhere(
    currentZoomWhere({ contractor: name, district: state.districtFilter, neighborhood }),
    { expand: 1.28 }
  );
}

function setColorMode(mode) {
  state.colorMode = mode === "contractor" ? "contractor" : "status";
  document.querySelectorAll("[data-color-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.colorMode === state.colorMode);
  });
  const layer = activeLayer();
  if (layer) {
    layer.renderer = state.colorMode === "contractor" ? contractorRenderer() : statusRenderer();
  }
  renderLegend();
  renderFreshness();
}

async function setDistrictFilter(district, { zoom = true } = {}) {
  state.districtFilter = district || "all";
  state.contractorFilter = "all";
  state.mapFocusLabel = state.districtFilter === "all" ? "" : "district focus";
  const layer = activeLayer();
  if (layer) {
    layer.definitionExpression = whereForFilter();
  }
  updateDistrictHighlight();
  renderAll();
  if (zoom && state.dataView === "current") await zoomToDistrict(state.districtFilter);
}

async function setContractorFilter(name, { zoom = false } = {}) {
  state.contractorFilter = name || "all";
  if (state.contractorFilter === "all") {
    state.mapFocusLabel = state.districtFilter === "all" ? "" : "district focus";
  }
  const layer = activeLayer();
  if (layer) {
    layer.definitionExpression = whereForFilter();
  }
  renderKpis();
  renderContractors();
  renderActionFocus();
  renderFreshness();
  if (zoom) {
    if (state.dataView === "current") {
      await zoomToContractorCluster(state.contractorFilter);
    } else {
      await zoomToActiveFilteredExtent({ expand: state.contractorFilter === "all" ? 1.08 : 1.22 });
    }
    renderFreshness();
  }
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

function activeLayer() {
  return state.layers[state.dataView];
}

function renderAll() {
  renderMonthOptions();
  renderDistrictOptions();
  renderKpis();
  renderStatusSummary();
  renderContractors();
  renderLegend();
  renderActionFocus();
  renderFreshness();
}

async function setDataView(mode) {
  state.dataView = mode === "history" ? "history" : "current";
  state.contractorFilter = "all";
  state.districtFilter = state.dataView === "current" ? state.districtFilter : "all";
  state.mapFocusLabel = "";
  setActiveDataset();
  const dataViewSelect = document.getElementById("dataViewSelect");
  if (dataViewSelect) dataViewSelect.value = state.dataView;
  Object.entries(state.layers).forEach(([key, layer]) => {
    layer.visible = key === state.dataView;
    layer.definitionExpression = whereForFilter(key);
    if (key === state.dataView) layer.renderer = state.colorMode === "contractor" ? contractorRenderer() : statusRenderer();
  });
  updateDistrictHighlight();
  renderAll();
  const layer = activeLayer();
  if (state.view && layer?.fullExtent) {
    await state.view.goTo(layer.fullExtent.expand(1.08), { duration: 450 }).catch(() => {});
  }
}

function setMonthFilter(month) {
  state.dataView = "history";
  setActiveDataset();
  state.selectedMonth = month || state.summary.latest_month;
  state.contractorFilter = "all";
  state.districtFilter = "all";
  state.mapFocusLabel = "";
  const layer = activeLayer();
  if (layer) {
    layer.definitionExpression = whereForFilter();
  }
  updateDistrictHighlight();
  renderAll();
  document.getElementById("parcelDetail").textContent =
    "Select a parcel to review contractor, status, ownership, and survey period.";
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
  });
  const dataViewSelect = document.getElementById("dataViewSelect");
  if (dataViewSelect) {
    dataViewSelect.addEventListener("change", (event) => setDataView(event.target.value));
  }
  document.getElementById("clearContractorButton").addEventListener("click", () => setContractorFilter("all", { zoom: true }));
  document.getElementById("clearDistrictButton").addEventListener("click", () => setDistrictFilter("all", { zoom: true }));
  document.getElementById("districtSelect").addEventListener("change", (event) => setDistrictFilter(event.target.value, { zoom: true }));
  document.getElementById("monthSelect").addEventListener("change", (event) => setMonthFilter(event.target.value));
  document.getElementById("exportPdfButton").addEventListener("click", exportPrintPdf);
}

function exportStats(features) {
  const active = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Active");
  const returned = uniqueCount(features, (feature) => feature.properties.returned_flag);
  const requestOnly = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Request Only");
  const open = uniqueCount(features, (feature) => feature.properties.completion_status === "missing");
  const assigned = uniqueCount(features);
  const neighborhoods = new Set(features.map((feature) => feature.properties.neighborhood).filter(Boolean)).size;
  return { active, returned, requestOnly, open, assigned, neighborhoods, completionRate: pct(returned, active) };
}

function contractorOpenRank() {
  if (state.contractorFilter === "all") return null;
  const rows = contractorPerformanceRows(districtFilteredFeatures())
    .sort((a, b) => b.open - a.open || a.rate - b.rate);
  const index = rows.findIndex((row) => row.organization === state.contractorFilter);
  return index >= 0 ? index + 1 : null;
}

function printLegendHtml() {
  const statuses = state.dataView === "current"
    ? ["current_active", "request_only"]
    : ["returned", "missing", "request_only"];
  return statuses.map((status) => `
    <div class="print-legend-row">
      <span style="background:${statusColors[status]}"></span>
      <strong>${escapeHtml(statusLabel(status))}</strong>
    </div>
  `).join("");
}

function statLine(label, value) {
  return `<div class="print-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function buildPrintHtml(mapImage, stats, screenshotScale) {
  const contractor = state.contractorFilter === "all" ? "All Contractors" : shortContractor(state.contractorFilter);
  const district = state.districtFilter === "all" ? "All Districts" : `Council District ${state.districtFilter}`;
  const month = state.dataView === "current" ? "Current portfolio" : state.selectedMonth;
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
      * { box-sizing: border-box; }
      body { margin: 0; background: #e8eef2; color: #111820; font-family: Manrope, Segoe UI, Arial, sans-serif; }
      .sheet { width: 400mm; height: 277mm; margin: 0 auto; background: #fff; border: 1px solid #b9c9d4; display: grid; grid-template-rows: 27mm 1fr 12mm; }
      header { display: grid; grid-template-columns: 1fr auto; gap: 10mm; align-items: center; padding: 8mm 10mm 5mm; border-bottom: 1px solid #d8e4ea; }
      h1 { margin: 0; color: #00334f; font-size: 19pt; line-height: 1.05; }
      .subtitle { margin-top: 2mm; color: #586872; font-size: 9pt; font-weight: 700; }
      .brand { color: #0098d3; font-size: 18pt; font-weight: 800; letter-spacing: .02em; }
      main { display: grid; grid-template-columns: 1fr 82mm; gap: 6mm; padding: 6mm 8mm; min-height: 0; }
      .map-frame { position: relative; border: 1px solid #b9c9d4; background: #eef4f7; overflow: hidden; }
      .map-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .north { position: absolute; left: 8mm; bottom: 11mm; display: grid; place-items: center; color: #00334f; font-weight: 800; font-size: 18pt; }
      .north::before { content: ""; width: 0; height: 0; border-left: 7mm solid transparent; border-right: 7mm solid transparent; border-bottom: 21mm solid #00334f; display: block; margin-bottom: 1mm; }
      .scale { position: absolute; right: 8mm; bottom: 8mm; min-width: 46mm; color: #111820; font-size: 7pt; font-weight: 800; }
      .scale-bar { height: 4mm; border-left: 1px solid #111820; border-right: 1px solid #111820; border-bottom: 3mm solid #111820; background: #fff; margin-bottom: 1mm; }
      aside { display: grid; grid-template-rows: auto auto 1fr; gap: 4mm; min-width: 0; }
      .box { border: 1px solid #d8e4ea; padding: 5mm; background: #f7fbfd; }
      .box h2 { margin: 0 0 3mm; color: #00334f; font-size: 10pt; text-transform: uppercase; letter-spacing: .04em; }
      .print-stat { display: grid; grid-template-columns: 1fr auto; gap: 5mm; padding: 2.3mm 0; border-bottom: 1px solid #d8e4ea; font-size: 8pt; }
      .print-stat:last-child { border-bottom: 0; }
      .print-stat span { color: #586872; font-weight: 700; }
      .print-stat strong { color: #111820; font-size: 10pt; }
      .print-legend-row { display: grid; grid-template-columns: 6mm 1fr; gap: 3mm; align-items: center; margin: 3mm 0; font-size: 8pt; }
      .print-legend-row span { width: 6mm; height: 6mm; border: 1px solid rgba(17,24,32,.32); display: inline-block; }
      .boundary { border-top: 1.4px solid #9a7419; width: 18mm; display: inline-block; vertical-align: middle; margin-right: 3mm; }
      .action { color: #111820; font-size: 9pt; line-height: 1.45; font-weight: 700; }
      footer { display: flex; align-items: center; justify-content: space-between; padding: 0 10mm; color: #586872; font-size: 7.5pt; border-top: 1px solid #d8e4ea; }
      @media print { body { background: #fff; } .sheet { margin: 0; } }
    </style>
  </head>
  <body>
    <section class="sheet">
      <header>
        <div>
          <h1>URA LandCare Survey Map</h1>
          <div class="subtitle">Survey Month: ${escapeHtml(month)} &nbsp;|&nbsp; Contractor: ${escapeHtml(contractor)} &nbsp;|&nbsp; ${escapeHtml(district)}</div>
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
          <div class="box">
            <h2>Summary Stats</h2>
            ${statLine("Assigned parcels", formatNumber(stats.assigned))}
            ${statLine("Active assigned", formatNumber(stats.active))}
            ${statLine("Surveys returned", formatNumber(stats.returned))}
            ${statLine("Open active", formatNumber(stats.open))}
            ${statLine("Request only", formatNumber(stats.requestOnly))}
            ${statLine("Completion rate", stats.completionRate)}
            ${statLine("Neighborhoods", formatNumber(stats.neighborhoods))}
            ${rank ? statLine("Open parcel rank", `#${rank}`) : ""}
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
      window.addEventListener("load", () => setTimeout(() => window.print(), 450));
    </script>
  </body>
</html>`;
}

async function exportPrintPdf() {
  const button = document.getElementById("exportPdfButton");
  const status = document.getElementById("exportStatus");
  const priorLabel = button.textContent;
  const priorViewpoint = state.view?.viewpoint?.clone();
  button.disabled = true;
  button.textContent = "Preparing PDF...";
  status.textContent = "";
  const printWindow = window.open("", "_blank");
  try {
    if (!printWindow) throw new Error("Popup blocked. Allow popups to open the print layout.");
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><title>Preparing map export</title><body style="font-family:system-ui,sans-serif;padding:24px">Preparing map export...</body>`);
    printWindow.document.close();
    await zoomToActiveFilteredExtent({ expand: state.contractorFilter === "all" ? 1.08 : 1.22, duration: 350 });
    await state.view.when();
    const screenshotScale = state.view.scale;
    const screenshot = await state.view.takeScreenshot({
      width: 1700,
      height: 1050,
      format: "png"
    });
    const stats = exportStats(filteredFeatures());
    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(screenshot.dataUrl, stats, screenshotScale));
    printWindow.document.close();
    status.textContent = "Print layout opened. Choose Save as PDF in the print dialog.";
  } catch (error) {
    console.error(error);
    status.textContent = "PDF export failed. Try again after the map finishes loading.";
  } finally {
    if (priorViewpoint) await state.view.goTo(priorViewpoint, { duration: 250 }).catch(() => {});
    button.disabled = false;
    button.textContent = priorLabel;
  }
}

async function loadData() {
  const [historySummary, historyGeojson, currentDataset] = await Promise.all([
    fetch(`${DATA_ROOT}/latest_month_summary.json`).then((response) => response.json()),
    fetch(`${DATA_ROOT}/all_months.geojson`).then((response) => response.json()),
    loadCurrentArcgisDataset()
  ]);
  state.datasets = {
    history: { summary: historySummary, geojson: historyGeojson },
    current: currentDataset
  };
  state.selectedMonth = historySummary.latest_month;
  setActiveDataset();
}

async function fetchArcgisJson(url, params) {
  const response = await fetch(`${url}?${new URLSearchParams(params).toString()}`);
  if (!response.ok) throw new Error(`ArcGIS request failed: ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "ArcGIS request failed");
  return payload;
}

async function loadCurrentArcgisDataset() {
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
  const features = (result.features || []).map((feature) => ({
    type: "Feature",
    geometry: null,
    properties: normalizeCurrentAttributes(feature.attributes || {})
  }));
  return summarizeCurrentDataset(features, {
    sourceKind: "live_arcgis",
    generatedOn: "live",
    eppLayerEdited: dateFromMillis(layerInfo.editingInfo?.dataLastEditDate),
    surveyLayerEdited: dateFromMillis(surveyInfo.editingInfo?.dataLastEditDate),
    eppRecordCount: layerInfo.recordCount,
    surveyRecordCount: surveyInfo.recordCount
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
  const sourceNote = "Current URA-owned LandCare parcel inventory.";
  return {
    summary: {
      generated_on: options.generatedOn,
      view: "current_arcgis_universe",
      view_source: options.sourceKind,
      source_note: sourceNote,
      source_layer: "gisdb_gis_epp_parcels_full",
      source_layer_url: EPP_LAYER_URL.replace(/\/0$/, ""),
      survey_layer: "gisdb_gis_regrid_surveys",
      survey_layer_url: SURVEY_LAYER_URL.replace(/\/0$/, ""),
      ownership_scope: "URA owned only",
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
        service_url: SURVEY_LAYER_URL.replace(/\/0$/, "")
      }
    },
    geojson: {
      type: "FeatureCollection",
      metadata: {},
      features
    }
  };
}

function buildHistoryLayer({ url, title, mode, visible }) {
  return new GeoJSONLayer({
    url,
    title,
    outFields: ["*"],
    visible,
    definitionExpression: whereForFilter(mode),
    renderer: statusRenderer(mode),
    opacity: 0.9,
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

function buildCurrentLayer({ visible }) {
  return new FeatureLayer({
    url: EPP_LAYER_URL,
    title: "Current URA-Owned LandCare Parcels",
    outFields: ["*"],
    visible,
    definitionExpression: whereForFilter("current"),
    renderer: statusRenderer("current"),
    opacity: 0.9,
    popupTemplate: {
      title: "Parcel {parcel_number}",
      content: [
        {
          type: "fields",
          fieldInfos: [
            { fieldName: "property_id", label: "Property ID" },
            { fieldName: "property_maint_mgr_name", label: "LandCare contractor" },
            { fieldName: "tags", label: "LandCare tags" },
            { fieldName: "current_status", label: "Property status" },
            { fieldName: "inventory_type", label: "Inventory type" },
            { fieldName: "property_class", label: "Property class" },
            { fieldName: "project_name", label: "Project" },
            { fieldName: "council_district", label: "Council district" },
            { fieldName: "neighborhood", label: "Neighborhood" },
            { fieldName: "census_tract", label: "Census tract" },
            { fieldName: "zoned_as", label: "Zoning" },
            { fieldName: "parcel_sqft", label: "Parcel sq ft", format: { digitSeparator: true, places: 0 } },
            { fieldName: "par_calcacreag", label: "Acres", format: { places: 2 } },
            { fieldName: "mod_dt", label: "Last modified", format: { dateFormat: "short-date" } }
          ]
        }
      ]
    }
  });
}

async function initMap() {
  const historyLayer = buildHistoryLayer({
    url: `${DATA_ROOT}/all_months.geojson`,
    title: "LandCare URA-Owned Parcel Months",
    mode: "history",
    visible: state.dataView === "history"
  });
  const currentLayer = buildCurrentLayer({
    visible: state.dataView === "current"
  });
  state.layers = { history: historyLayer, current: currentLayer };

  const neighborhoodLayer = new FeatureLayer({
    url: "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebNeighborhoods/FeatureServer/0",
    title: "City Neighborhoods",
    opacity: 0.18,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [0, 152, 211, 0.04],
        outline: { color: [0, 108, 159, 0.45], width: 0.7 }
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
        color: [240, 194, 75, 0.02],
        outline: { color: [124, 86, 8, 0.55], width: 0.85 }
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
  state.boundaryLayers.councilHighlight = councilHighlightLayer;

  const map = new Map({
    basemap: "topo-vector",
    layers: [neighborhoodLayer, councilLayer, councilHighlightLayer, historyLayer, currentLayer]
  });

  const view = new MapView({
    container: "mapView",
    map,
    center: [-79.9959, 40.4406],
    zoom: 13,
    constraints: { minZoom: 11 },
    popup: {
      dockEnabled: false
    }
  });

  state.view = view;
  view.ui.add(new Home({ view }), "top-left");
  view.ui.add(new Search({ view, includeDefaultSources: true }), "top-right");
  view.ui.add(new BasemapToggle({ view, nextBasemap: "satellite" }), "bottom-right");

  view.on("click", async (event) => {
    const hit = await view.hitTest(event);
    const graphic = hit.results.find((result) => result.graphic?.layer === activeLayer())?.graphic;
    if (!graphic?.attributes) return;
    const props = state.dataView === "current" ? normalizeCurrentAttributes(graphic.attributes) : graphic.attributes;
    setParcelDetail(props);
  });

  await view.when();
  await Promise.all([historyLayer.when(), currentLayer.when()]);
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
  document.getElementById("mapBadge").textContent = "Monitoring map failed to initialize.";
});
