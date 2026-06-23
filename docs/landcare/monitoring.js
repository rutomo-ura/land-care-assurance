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
const CURRENT_WHERE = "tags LIKE '%LandCare%' AND inventory_type = 'URA Owned'";
const CURRENT_OUT_FIELDS = [
  "OBJECTID",
  "parcel_number",
  "property_id",
  "inventory_type",
  "current_status",
  "neighborhood",
  "project_name",
  "property_class",
  "property_maint_mgr_name",
  "tags",
  "mod_dt",
  "parcel_sqft"
].join(",");

const statusColors = {
  current_active: "#0098d3",
  returned: "#0098d3",
  missing: "#f0c24b",
  request_only: "#aab8c2",
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
  contractorFilter: "all",
  colorMode: "status",
  selectedMonth: null,
  dataView: "current"
};

const formatter = new Intl.NumberFormat("en-US");

function formatNumber(value) {
  return formatter.format(Number(value || 0));
}

function pct(numerator, denominator) {
  return denominator ? `${((100 * numerator) / denominator).toFixed(1)}%` : "0.0%";
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
    current_active: "Active LandCare",
    returned: "Returned",
    missing: "Open / not returned",
    request_only: "Request Only",
    ownership_risk: "Ownership risk"
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
  for (const feature of currentMonthFeatures()) {
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
    neighborhood: attrs.neighborhood,
    project_name: attrs.project_name,
    property_class: attrs.property_class,
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

function filteredFeatures() {
  const features = currentMonthFeatures();
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
  }
  if (mode === "history") {
    const month = String(state.selectedMonth || state.datasets.history.summary.latest_month).replace(/'/g, "''");
    clauses.push(`period_month = '${month}'`);
  }
  if (state.contractorFilter !== "all") {
    if (mode === "current") {
      const contacts = [
        ...new Set(
          (state.datasets?.current?.geojson?.features || [])
            .filter((feature) => feature.properties.organization === state.contractorFilter)
            .map((feature) => feature.properties.organization_contact)
            .filter(Boolean)
        )
      ];
      if (contacts.length) {
        clauses.push(`(${contacts.map((contact) => `property_maint_mgr_name = '${String(contact).replace(/'/g, "''")}'`).join(" OR ")})`);
      }
    } else {
      clauses.push(`organization = '${String(state.contractorFilter).replace(/'/g, "''")}'`);
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
    document.getElementById("actionFocus").innerHTML = `
      <div><strong>${formatNumber(features.length)}</strong><span>Current URA-owned LandCare records</span></div>
      <div><strong>${formatNumber(active)}</strong><span>Active LandCare records in the current parcel inventory</span></div>
      <div><strong>${formatNumber(requestOnly)}</strong><span>Request Only records separated from compliance metrics</span></div>
      <div><strong>${formatNumber(neighborhoods)}</strong><span>Neighborhoods represented in the current layer</span></div>
    `;
    return;
  }
  const activeOpen = uniqueCount(
    features,
    (feature) =>
      feature.properties.maintenance_level === "Active" &&
      feature.properties.completion_status === "missing"
  );
  const returned = uniqueCount(features, (feature) => feature.properties.returned_flag);
  const requestOnly = uniqueCount(features, (feature) => feature.properties.maintenance_level === "Request Only");
  document.getElementById("actionFocus").innerHTML = `
    <div><strong>${formatNumber(features.length)}</strong><span>URA-owned parcels in current filter</span></div>
    <div><strong>${formatNumber(activeOpen)}</strong><span>Active URA-owned parcels still open</span></div>
    <div><strong>${formatNumber(returned)}</strong><span>Returned surveys matched to URA-owned parcels</span></div>
    <div><strong>${formatNumber(requestOnly)}</strong><span>Request Only URA-owned assignments separated from Active compliance</span></div>
  `;
}

function renderFreshness() {
  document.getElementById("freshnessNote").textContent = "Current LandCare universe";
  if (state.dataView === "current") {
    document.getElementById("mapBadge").textContent =
      `${formatNumber(currentMonthFeatures().length)} records / ${formatNumber(uniqueCount(currentMonthFeatures()))} parcels`;
    document.getElementById("mapCallout").innerHTML = `
      <strong>Current URA-owned LandCare universe</strong>
      <span>Active and request-only records organized by contractor.</span>
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
      Contractor: ${escapeHtml(props.organization)}<br>
      Maintenance level: ${escapeHtml(props.maintenance_level)}<br>
      Current status: ${escapeHtml(props.current_status || "Unknown")}<br>
      Neighborhood: ${escapeHtml(props.neighborhood || "Unknown")}<br>
      Project: ${escapeHtml(props.project_name || "None")}<br>
      Inventory: ${escapeHtml(props.inventory_type || "Unknown")}<br>
      Modified: ${escapeHtml(props.mod_dt || "Unknown")}<br>
      Source: ArcGIS parcel inventory
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

function setContractorFilter(name) {
  state.contractorFilter = name || "all";
  const layer = activeLayer();
  if (layer) {
    layer.definitionExpression = whereForFilter();
  }
  renderKpis();
  renderContractors();
  renderActionFocus();
  renderFreshness();
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
  renderKpis();
  renderContractors();
  renderLegend();
  renderActionFocus();
  renderFreshness();
}

async function setDataView(mode) {
  state.dataView = mode === "history" ? "history" : "current";
  state.contractorFilter = "all";
  setActiveDataset();
  const dataViewSelect = document.getElementById("dataViewSelect");
  if (dataViewSelect) dataViewSelect.value = state.dataView;
  Object.entries(state.layers).forEach(([key, layer]) => {
    layer.visible = key === state.dataView;
    layer.definitionExpression = whereForFilter(key);
    if (key === state.dataView) layer.renderer = state.colorMode === "contractor" ? contractorRenderer() : statusRenderer();
  });
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
  const layer = activeLayer();
  if (layer) {
    layer.definitionExpression = whereForFilter();
  }
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
      setContractorFilter(state.contractorFilter === name ? "all" : name);
    }
  });
  const dataViewSelect = document.getElementById("dataViewSelect");
  if (dataViewSelect) {
    dataViewSelect.addEventListener("change", (event) => setDataView(event.target.value));
  }
  document.getElementById("clearContractorButton").addEventListener("click", () => setContractorFilter("all"));
  document.getElementById("monthSelect").addEventListener("change", (event) => setMonthFilter(event.target.value));
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
      title: "{property_maint_mgr_name}",
      content: `
        <b>Parcel:</b> {parcel_number}<br>
        <b>Inventory:</b> {inventory_type}<br>
        <b>Status:</b> {current_status}<br>
        <b>Tags:</b> {tags}<br>
        <b>Neighborhood:</b> {neighborhood}
      `
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

  const map = new Map({
    basemap: "topo-vector",
    layers: [neighborhoodLayer, historyLayer, currentLayer]
  });

  const view = new MapView({
    container: "mapView",
    map,
    center: [-79.9959, 40.4406],
    zoom: 12,
    constraints: { minZoom: 10 },
    popup: {
      dockEnabled: true,
      dockOptions: { buttonEnabled: false, breakpoint: false, position: "bottom-left" }
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
  const layer = activeLayer();
  if (layer?.fullExtent) {
    await view.goTo(layer.fullExtent.expand(1.08), { duration: 650 }).catch(() => {});
  }
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
