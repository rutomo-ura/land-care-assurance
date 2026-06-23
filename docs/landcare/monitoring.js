import Map from "https://js.arcgis.com/4.30/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js";
import GeoJSONLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/GeoJSONLayer.js";
import FeatureLayer from "https://js.arcgis.com/4.30/@arcgis/core/layers/FeatureLayer.js";
import Home from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Home.js";
import Search from "https://js.arcgis.com/4.30/@arcgis/core/widgets/Search.js";
import BasemapToggle from "https://js.arcgis.com/4.30/@arcgis/core/widgets/BasemapToggle.js";

const DATA_ROOT = "../landcare/data";

const statusColors = {
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
  view: null,
  parcelLayer: null,
  contractorFilter: "all",
  colorMode: "status",
  selectedMonth: null
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
  for (const feature of currentMonthFeatures()) {
    const props = feature.properties || {};
    const org = props.organization || "Unassigned";
    const parcelKey = props.parcel_key;
    if (!parcelKey) continue;
    counts[org] ||= new Set();
    returned[org] ||= new Set();
    counts[org].add(parcelKey);
    if (props.returned_flag) returned[org].add(parcelKey);
  }
  return Object.entries(counts)
    .map(([name, keys]) => [name, keys.size])
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], index) => ({
      name,
      label: shortContractor(name),
      count,
      returned: returned[name]?.size || 0,
      color: contractorPalette[index % contractorPalette.length]
    }));
}

function contractorColor(name) {
  return contractorItems().find((item) => item.name === name)?.color || "#8a8f98";
}

function currentMonthFeatures() {
  const features = state.geojson?.features || [];
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

function statusRenderer() {
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

function contractorRenderer() {
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

function whereForFilter() {
  const month = String(state.selectedMonth || state.summary.latest_month).replace(/'/g, "''");
  const clauses = [`period_month = '${month}'`];
  if (state.contractorFilter !== "all") {
    clauses.push(`organization = '${String(state.contractorFilter).replace(/'/g, "''")}'`);
  }
  return clauses.join(" AND ");
}

function availableMonths() {
  return state.summary.available_months || [
    ...new Set((state.geojson?.features || []).map((feature) => feature.properties.period_month))
  ].sort();
}

function renderMonthOptions() {
  const select = document.getElementById("monthSelect");
  const months = availableMonths();
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
  document.getElementById("latestMonthLabel").textContent =
    `${state.selectedMonth} URA-owned survey month`;
  document.getElementById("assignedKpi").textContent = formatNumber(uniqueCount(features));
  document.getElementById("returnedKpi").textContent = formatNumber(returned);
  document.getElementById("completionKpi").textContent = pct(returned, active);
  document.getElementById("openKpi").textContent = formatNumber(open);
}

function renderContractors() {
  const container = document.getElementById("contractorList");
  container.innerHTML = contractorItems().map((item) => {
    const rate = pct(item.returned, item.count);
    const muted = state.contractorFilter !== "all" && state.contractorFilter !== item.name;
    return `
      <button class="contractor-row ${muted ? "is-muted" : ""}" type="button" data-contractor="${escapeHtml(item.name)}">
        <span class="contractor-dot" style="background:${item.color}"></span>
        <span>
          <strong>${escapeHtml(item.label)}</strong>
          <small>${formatNumber(item.count)} parcels - ${formatNumber(item.returned)} returned</small>
        </span>
        <em>${rate}</em>
      </button>
    `;
  }).join("");
}

function renderLegend() {
  const heading = document.getElementById("legendHeading");
  const list = document.getElementById("legendList");
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

  heading.textContent = "Legend - Survey Status";
  const counts = filteredFeatures().reduce((acc, feature) => {
    const status = feature.properties.completion_status || "missing";
    const parcelKey = feature.properties.parcel_key;
    if (!parcelKey) return acc;
    acc[status] ||= new Set();
    acc[status].add(parcelKey);
    return acc;
  }, {});
  list.innerHTML = Object.entries(statusColors)
    .filter(([status]) => status !== "ownership_risk" || counts[status]?.size)
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
  const note = state.summary.source_note || "PostgreSQL export";
  document.getElementById("freshnessNote").textContent =
    `${note} Generated ${state.summary.generated_on || "from export"}.`;
  document.getElementById("mapBadge").textContent =
    `${formatNumber(currentMonthFeatures().length)} parcels - ${state.selectedMonth} - ${formatNumber(state.summary.all_month_feature_count || state.geojson.features.length)} records total`;
  document.getElementById("mapCallout").innerHTML = `
    <strong>URA-owned ${state.selectedMonth} LandCare parcels</strong>
    <span>Colored by ${state.colorMode === "contractor" ? "contractor" : "survey status"}; current contractor filter: ${state.contractorFilter === "all" ? "all" : escapeHtml(shortContractor(state.contractorFilter))}.</span>
  `;
}

function parcelDetail(props) {
  return `
    <strong>${escapeHtml(props.parcel_key)}</strong><br>
    Contractor: ${escapeHtml(props.organization)}<br>
    Survey month: ${escapeHtml(props.period_month)}<br>
    Maintenance level: ${escapeHtml(props.maintenance_level)}<br>
    Status: ${escapeHtml(statusLabel(props.completion_status))}<br>
    Ownership: ${escapeHtml(props.ownership_type || "Other or unknown")}<br>
    Owner: ${escapeHtml(props.owner_name || "Unknown")}<br>
    Source geometry: ${props.masked_geometry ? "masked" : "PostgreSQL export"}
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
  if (state.parcelLayer) {
    state.parcelLayer.renderer = state.colorMode === "contractor" ? contractorRenderer() : statusRenderer();
  }
  renderLegend();
  renderFreshness();
}

function setContractorFilter(name) {
  state.contractorFilter = name || "all";
  if (state.parcelLayer) {
    state.parcelLayer.definitionExpression = whereForFilter();
  }
  renderKpis();
  renderContractors();
  renderActionFocus();
  renderFreshness();
}

function setMonthFilter(month) {
  state.selectedMonth = month || state.summary.latest_month;
  state.contractorFilter = "all";
  if (state.parcelLayer) {
    state.parcelLayer.definitionExpression = whereForFilter();
  }
  renderMonthOptions();
  renderKpis();
  renderContractors();
  renderLegend();
  renderActionFocus();
  renderFreshness();
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
  document.getElementById("clearContractorButton").addEventListener("click", () => setContractorFilter("all"));
  document.getElementById("monthSelect").addEventListener("change", (event) => setMonthFilter(event.target.value));
}

async function loadData() {
  const [summary, geojson] = await Promise.all([
    fetch(`${DATA_ROOT}/latest_month_summary.json`).then((response) => response.json()),
    fetch(`${DATA_ROOT}/all_months.geojson`).then((response) => response.json())
  ]);
  state.summary = summary;
  state.geojson = geojson;
  state.selectedMonth = summary.latest_month;
}

async function initMap() {
  const parcelLayer = new GeoJSONLayer({
    url: `${DATA_ROOT}/all_months.geojson`,
    title: "LandCare URA-Owned Parcel Months",
    outFields: ["*"],
    definitionExpression: whereForFilter(),
    renderer: statusRenderer(),
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
  state.parcelLayer = parcelLayer;

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
    layers: [neighborhoodLayer, parcelLayer]
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
    const graphic = hit.results.find((result) => result.graphic?.layer === parcelLayer)?.graphic;
    if (graphic?.attributes) setParcelDetail(graphic.attributes);
  });

  await view.when();
  await parcelLayer.when();
  if (parcelLayer.fullExtent) {
    await view.goTo(parcelLayer.fullExtent.expand(1.08), { duration: 650 }).catch(() => {});
  }
}

async function main() {
  wireControls();
  await loadData();
  renderMonthOptions();
  renderKpis();
  renderContractors();
  renderLegend();
  renderActionFocus();
  renderFreshness();
  await initMap();
}

main().catch((error) => {
  console.error(error);
  document.getElementById("mapBadge").textContent = "Monitoring map failed to initialize.";
});
